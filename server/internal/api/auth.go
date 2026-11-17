package api

import (
	"context"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/sametakbal/daktilab/server/internal/auth"
)

type userJSON struct {
	ID    string  `json:"id"`
	Email *string `json:"email"`
}

type profileJSON struct {
	ID       string `json:"id"`
	Username string `json:"username"`
}

type meJSON struct {
	User    *userJSON    `json:"user"`
	Profile *profileJSON `json:"profile"`
}

type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

const (
	minPasswordLen = 8
	maxPasswordLen = 256
)

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	uid, err := s.currentUser(w, r)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if uid == "" {
		writeJSON(w, http.StatusOK, meJSON{})
		return
	}
	s.writeMe(w, r, uid)
}

func (s *Server) writeMe(w http.ResponseWriter, r *http.Request, uid string) {
	me, err := s.loadMe(r.Context(), uid)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, me)
}

func (s *Server) loadMe(ctx context.Context, uid string) (meJSON, error) {
	var u userJSON
	var username *string
	err := s.db.QueryRow(ctx,
		"select u.id, u.email, p.username from users u left join profiles p on p.id = u.id where u.id = $1", uid,
	).Scan(&u.ID, &u.Email, &username)
	if err != nil {
		return meJSON{}, err
	}
	me := meJSON{User: &u}
	if username != nil {
		me.Profile = &profileJSON{ID: u.ID, Username: *username}
	}
	return me, nil
}

func normalizeEmail(raw string) (string, bool) {
	email := strings.ToLower(strings.TrimSpace(raw))
	if len(email) > 254 {
		return "", false
	}
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Address != email || !strings.Contains(email[strings.LastIndex(email, "@"):], ".") {
		return "", false
	}
	return email, true
}

func (s *Server) signup(w http.ResponseWriter, r *http.Request) {
	var in credentials
	if !readJSON(w, r, defaultBodyLimit, &in) {
		return
	}
	email, ok := normalizeEmail(in.Email)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid email address")
		return
	}
	if n := utf8.RuneCountInString(in.Password); n < minPasswordLen || len(in.Password) > maxPasswordLen {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	var uid string
	err = s.db.QueryRow(r.Context(), "insert into users (email, password_hash) values ($1, $2) returning id", email, hash).Scan(&uid)
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "an account with this email already exists")
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if err := s.startSession(r.Context(), w, uid); err != nil {
		s.internalError(w, r, err)
		return
	}
	s.writeMe(w, r, uid)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in credentials
	if !readJSON(w, r, defaultBodyLimit, &in) {
		return
	}
	email, _ := normalizeEmail(in.Email)
	if len(in.Password) > maxPasswordLen {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	var uid string
	var hash *string
	err := s.db.QueryRow(r.Context(), "select id, password_hash from users where email = $1", email).Scan(&uid, &hash)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && hash == nil) {
		// Unknown email, or an OAuth-only account: same answer and cost as a wrong password.
		auth.BurnVerify(in.Password)
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	rehash, err := auth.VerifyPassword(in.Password, *hash)
	if errors.Is(err, auth.ErrMismatch) {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if rehash {
		if fresh, err := auth.HashPassword(in.Password); err == nil {
			_, _ = s.db.Exec(r.Context(), "update users set password_hash = $2 where id = $1", uid, fresh)
		}
	}
	if err := s.startSession(r.Context(), w, uid); err != nil {
		s.internalError(w, r, err)
		return
	}
	s.writeMe(w, r, uid)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil && c.Value != "" {
		if _, err := s.db.Exec(r.Context(), "delete from sessions where token_hash = $1", auth.HashToken(c.Value)); err != nil {
			s.internalError(w, r, err)
			return
		}
	}
	s.clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
