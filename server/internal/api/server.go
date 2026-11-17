// Package api implements daktilab's HTTP API.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sametakbal/daktilab/server/internal/config"
)

type Server struct {
	cfg       *config.Config
	db        *pgxpool.Pool
	oauth     map[string]*oauthProvider
	authLimit *rateLimiter
}

func New(cfg *config.Config, pool *pgxpool.Pool) *Server {
	return &Server{
		cfg:       cfg,
		db:        pool,
		oauth:     newOAuthProviders(cfg),
		authLimit: newRateLimiter(10, time.Minute), // 10 sign-in/sign-up attempts per IP per minute
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", s.health)

	mux.HandleFunc("GET /api/auth/me", s.me)
	mux.HandleFunc("POST /api/auth/signup", s.limited(s.signup))
	mux.HandleFunc("POST /api/auth/login", s.limited(s.login))
	mux.HandleFunc("POST /api/auth/logout", s.logout)
	mux.HandleFunc("GET /api/auth/oauth/{provider}/start", s.oauthStart)
	mux.HandleFunc("GET /api/auth/oauth/{provider}/callback", s.oauthCallback)

	mux.HandleFunc("PUT /api/profile", s.putProfile)
	mux.HandleFunc("GET /api/progress", s.getProgress)
	mux.HandleFunc("PUT /api/progress", s.putProgress)
	mux.HandleFunc("POST /api/scores", s.postScore)
	mux.HandleFunc("GET /api/leaderboard/wpm", s.wpmLeaderboard)
	mux.HandleFunc("GET /api/leaderboard/streak", s.streakLeaderboard)
	mux.HandleFunc("GET /api/words", s.words)

	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "not found")
	})
	if s.cfg.StaticDir != "" {
		mux.Handle("/", http.FileServer(http.Dir(s.cfg.StaticDir)))
	}

	// Rejects cross-site state-changing requests (Sec-Fetch-Site / Origin), i.e. CSRF.
	csrf := http.NewCrossOriginProtection()
	if err := csrf.AddTrustedOrigin(s.cfg.AppOrigin()); err != nil {
		slog.Warn("cannot trust APP_URL origin", "err", err)
	}

	return s.recoverer(s.logRequests(s.cors(csrf.Handler(mux))))
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.db.Ping(ctx); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// cors allows credentialed requests from APP_URL, for deployments where the API is on another origin.
// Same-origin setups (Vite proxy, reverse proxy, STATIC_DIR) never hit this.
func (s *Server) cors(next http.Handler) http.Handler {
	allowed := s.cfg.AppOrigin()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin == allowed {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Credentials", "true")
			h.Add("Vary", "Origin")
			if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
				h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE")
				h.Set("Access-Control-Allow-Headers", "Content-Type")
				h.Set("Access-Control-Max-Age", "600")
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		if strings.HasPrefix(r.URL.Path, "/api/") {
			slog.Info("request", "method", r.Method, "path", r.URL.Path, "status", rec.status, "ms", time.Since(start).Milliseconds())
		}
	})
}

func (s *Server) recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				if v == http.ErrAbortHandler {
					panic(v)
				}
				slog.Error("panic", "path", r.URL.Path, "err", v)
				writeError(w, http.StatusInternalServerError, "internal error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func (s *Server) limited(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.authLimit.allow(s.clientIP(r)) {
			writeError(w, http.StatusTooManyRequests, "too many attempts, try again in a minute")
			return
		}
		h(w, r)
	}
}

func (s *Server) clientIP(r *http.Request) string {
	if s.cfg.TrustProxy {
		// The last hop is the one our own proxy appended; earlier entries are client-controlled.
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.Split(xff, ",")
			return strings.TrimSpace(parts[len(parts)-1])
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// --- JSON helpers ---

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (s *Server) internalError(w http.ResponseWriter, r *http.Request, err error) {
	slog.Error("handler error", "method", r.Method, "path", r.URL.Path, "err", err)
	writeError(w, http.StatusInternalServerError, "internal error")
}

const defaultBodyLimit = 64 << 10

// readJSON decodes a JSON body of at most limit bytes; on failure it writes a 400/413 and returns false.
func readJSON(w http.ResponseWriter, r *http.Request, limit int64, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	err := json.NewDecoder(r.Body).Decode(dst)
	if err == nil {
		return true
	}
	var tooLarge *http.MaxBytesError
	switch {
	case errors.As(err, &tooLarge):
		writeError(w, http.StatusRequestEntityTooLarge, "request body too large")
	case errors.Is(err, io.EOF):
		writeError(w, http.StatusBadRequest, "request body is empty")
	default:
		writeError(w, http.StatusBadRequest, "invalid JSON body")
	}
	return false
}
