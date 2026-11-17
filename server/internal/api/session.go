package api

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sametakbal/daktilab/server/internal/auth"
)

const (
	sessionCookie = "daktilab_session"
	sessionTTL    = 30 * 24 * time.Hour
	// Sessions are pushed forward to a full TTL once less than this remains (sliding expiry).
	sessionRefreshBelow = 15 * 24 * time.Hour
)

// startSession stores a new session for userID and sets its cookie.
func (s *Server) startSession(ctx context.Context, w http.ResponseWriter, userID string) error {
	token, hash, err := auth.NewSessionToken()
	if err != nil {
		return err
	}
	expires := time.Now().Add(sessionTTL)
	if _, err := s.db.Exec(ctx, "insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)", hash, userID, expires); err != nil {
		return err
	}
	s.setSessionCookie(w, token, expires)
	return nil
}

func (s *Server) setSessionCookie(w http.ResponseWriter, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

// currentUser resolves the session cookie to a user id ("" when signed out or expired).
func (s *Server) currentUser(w http.ResponseWriter, r *http.Request) (string, error) {
	c, err := r.Cookie(sessionCookie)
	if err != nil || c.Value == "" {
		return "", nil
	}
	hash := auth.HashToken(c.Value)
	var userID string
	var expires time.Time
	err = s.db.QueryRow(r.Context(),
		"select user_id, expires_at from sessions where token_hash = $1 and expires_at > now()", hash,
	).Scan(&userID, &expires)
	if errors.Is(err, pgx.ErrNoRows) {
		s.clearSessionCookie(w)
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if time.Until(expires) < sessionRefreshBelow {
		expires = time.Now().Add(sessionTTL)
		if _, err := s.db.Exec(r.Context(), "update sessions set expires_at = $2 where token_hash = $1", hash, expires); err != nil {
			return "", err
		}
		s.setSessionCookie(w, c.Value, expires)
	}
	return userID, nil
}

// requireUser is currentUser for endpoints that need a signed-in user; it writes the 401 itself.
func (s *Server) requireUser(w http.ResponseWriter, r *http.Request) (string, bool) {
	uid, err := s.currentUser(w, r)
	if err != nil {
		s.internalError(w, r, err)
		return "", false
	}
	if uid == "" {
		writeError(w, http.StatusUnauthorized, "not signed in")
		return "", false
	}
	return uid, true
}

// DeleteExpiredSessions removes sessions past their expiry; main runs it periodically.
func (s *Server) DeleteExpiredSessions(ctx context.Context) (int64, error) {
	tag, err := s.db.Exec(ctx, "delete from sessions where expires_at <= now()")
	return tag.RowsAffected(), err
}
