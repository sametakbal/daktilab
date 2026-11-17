package api

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sametakbal/daktilab/server/internal/auth"
	"github.com/sametakbal/daktilab/server/internal/config"
	"golang.org/x/oauth2"
)

const oauthCookie = "daktilab_oauth"

// identity is what we need from a provider: a stable id and, if the provider vouches for it, an email.
type identity struct {
	ID            string
	Email         string
	EmailVerified bool
}

type oauthProvider struct {
	config   *oauth2.Config
	identify func(ctx context.Context, client *http.Client) (identity, error)
}

func newOAuthProviders(cfg *config.Config) map[string]*oauthProvider {
	providers := map[string]*oauthProvider{}
	callback := func(name string) string { return cfg.PublicAPIURL + "/auth/oauth/" + name + "/callback" }

	if cfg.Google.Enabled() {
		providers["google"] = &oauthProvider{
			config: &oauth2.Config{
				ClientID:     cfg.Google.ID,
				ClientSecret: cfg.Google.Secret,
				RedirectURL:  callback("google"),
				Scopes:       []string{"openid", "email"},
				Endpoint: oauth2.Endpoint{
					AuthURL:  "https://accounts.google.com/o/oauth2/v2/auth",
					TokenURL: "https://oauth2.googleapis.com/token",
				},
			},
			identify: googleIdentity,
		}
	}
	if cfg.GitHub.Enabled() {
		providers["github"] = &oauthProvider{
			config: &oauth2.Config{
				ClientID:     cfg.GitHub.ID,
				ClientSecret: cfg.GitHub.Secret,
				RedirectURL:  callback("github"),
				Scopes:       []string{"read:user", "user:email"},
				Endpoint: oauth2.Endpoint{
					AuthURL:  "https://github.com/login/oauth/authorize",
					TokenURL: "https://github.com/login/oauth/access_token",
				},
			},
			identify: githubIdentity,
		}
	}
	return providers
}

type oauthState struct {
	State    string `json:"s"`
	Verifier string `json:"v"`
	Redirect string `json:"r"`
}

// safeRedirect only lets OAuth return to the app's own origin (no open redirect).
func (s *Server) safeRedirect(raw string) string {
	fallback := s.cfg.AppURL.String() + "/"
	if raw == "" {
		return fallback
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme+"://"+u.Host != s.cfg.AppOrigin() || u.User != nil {
		return fallback
	}
	return u.String()
}

func (s *Server) oauthStart(w http.ResponseWriter, r *http.Request) {
	p, ok := s.oauth[r.PathValue("provider")]
	if !ok {
		writeError(w, http.StatusNotFound, "sign-in provider is not configured")
		return
	}
	st := oauthState{
		State:    auth.RandomString(),
		Verifier: oauth2.GenerateVerifier(),
		Redirect: s.safeRedirect(r.URL.Query().Get("redirect")),
	}
	raw, _ := json.Marshal(st)
	http.SetCookie(w, &http.Cookie{
		Name:     oauthCookie,
		Value:    base64.RawURLEncoding.EncodeToString(raw),
		Path:     "/",
		MaxAge:   600,
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode, // sent on the provider's top-level redirect back to us
	})
	http.Redirect(w, r, p.config.AuthCodeURL(st.State, oauth2.S256ChallengeOption(st.Verifier)), http.StatusFound)
}

func (s *Server) oauthCallback(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("provider")
	p, ok := s.oauth[name]
	if !ok {
		writeError(w, http.StatusNotFound, "sign-in provider is not configured")
		return
	}

	var st oauthState
	if c, err := r.Cookie(oauthCookie); err == nil {
		if raw, err := base64.RawURLEncoding.DecodeString(c.Value); err == nil {
			_ = json.Unmarshal(raw, &st)
		}
	}
	http.SetCookie(w, &http.Cookie{Name: oauthCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode})
	redirect := s.safeRedirect(st.Redirect)

	fail := func(code string, err error) {
		if err != nil {
			slog.Warn("oauth sign-in failed", "provider", name, "code", code, "err", err)
		}
		http.Redirect(w, r, withQuery(redirect, "oauth_error", code), http.StatusFound)
	}

	q := r.URL.Query()
	if e := q.Get("error"); e != "" {
		fail(e, nil)
		return
	}
	if st.State == "" || q.Get("state") != st.State {
		fail("invalid_state", nil)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	ctx = context.WithValue(ctx, oauth2.HTTPClient, &http.Client{Timeout: 10 * time.Second})

	tok, err := p.config.Exchange(ctx, q.Get("code"), oauth2.VerifierOption(st.Verifier))
	if err != nil {
		fail("exchange_failed", err)
		return
	}
	id, err := p.identify(ctx, p.config.Client(ctx, tok))
	if err != nil {
		fail("profile_failed", err)
		return
	}
	uid, err := s.userForIdentity(ctx, name, id)
	if err != nil {
		fail("server_error", err)
		return
	}
	if err := s.startSession(ctx, w, uid); err != nil {
		fail("server_error", err)
		return
	}
	http.Redirect(w, r, redirect, http.StatusFound)
}

// userForIdentity finds the user behind a provider identity, linking it to an existing account
// with the same verified email, or creating a new account.
func (s *Server) userForIdentity(ctx context.Context, provider string, id identity) (string, error) {
	var uid string
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, "select user_id from user_identities where provider = $1 and provider_user_id = $2", provider, id.ID).Scan(&uid)
		if err == nil {
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}

		var email *string
		if id.EmailVerified && id.Email != "" {
			e := strings.ToLower(id.Email)
			email = &e
			err := tx.QueryRow(ctx, "select id from users where email = $1", e).Scan(&uid)
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
		}
		if uid == "" {
			if err := tx.QueryRow(ctx, "insert into users (email) values ($1) returning id", email).Scan(&uid); err != nil {
				return err
			}
		}
		_, err = tx.Exec(ctx, "insert into user_identities (provider, provider_user_id, user_id, email) values ($1, $2, $3, $4)",
			provider, id.ID, uid, email)
		return err
	})
	return uid, err
}

func googleIdentity(ctx context.Context, client *http.Client) (identity, error) {
	var info struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
	}
	if err := getJSON(ctx, client, "https://openidconnect.googleapis.com/v1/userinfo", &info); err != nil {
		return identity{}, err
	}
	if info.Sub == "" {
		return identity{}, errors.New("google userinfo has no subject")
	}
	return identity{ID: info.Sub, Email: info.Email, EmailVerified: info.EmailVerified}, nil
}

func githubIdentity(ctx context.Context, client *http.Client) (identity, error) {
	var user struct {
		ID int64 `json:"id"`
	}
	if err := getJSON(ctx, client, "https://api.github.com/user", &user); err != nil {
		return identity{}, err
	}
	if user.ID == 0 {
		return identity{}, errors.New("github user has no id")
	}
	id := identity{ID: strconv.FormatInt(user.ID, 10)}

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := getJSON(ctx, client, "https://api.github.com/user/emails", &emails); err == nil {
		for _, e := range emails {
			if e.Primary && e.Verified {
				id.Email, id.EmailVerified = e.Email, true
			}
		}
	}
	return id, nil
}

func getJSON(ctx context.Context, client *http.Client, url string, dst any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: %s", url, res.Status)
	}
	return json.NewDecoder(http.MaxBytesReader(nil, res.Body, 1<<20)).Decode(dst)
}

// withQuery adds a query parameter before any #fragment (the app uses hash routing).
func withQuery(raw, key, value string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	q := u.Query()
	q.Set(key, value)
	u.RawQuery = q.Encode()
	return u.String()
}
