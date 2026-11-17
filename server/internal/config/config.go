// Package config reads the server configuration from environment variables.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
)

type OAuthClient struct {
	ID     string
	Secret string
}

func (c OAuthClient) Enabled() bool { return c.ID != "" && c.Secret != "" }

type Config struct {
	Addr        string
	DatabaseURL string
	// AppURL is where the frontend is served. OAuth may only redirect back to this origin,
	// and it is the one cross-origin caller allowed (CORS) when the API lives elsewhere.
	AppURL *url.URL
	// PublicAPIURL is the API base as browsers reach it (used to build OAuth callback URLs).
	PublicAPIURL string
	// CookieSecure sets the Secure flag on cookies; off only for plain-http local development.
	CookieSecure bool
	// TrustProxy takes the client IP from X-Forwarded-For (only behind a reverse proxy you control).
	TrustProxy bool
	// StaticDir, if set, is served at / (e.g. the frontend's dist/), for single-binary deploys.
	StaticDir string
	Google    OAuthClient
	GitHub    OAuthClient
}

func Load() (*Config, error) {
	c := &Config{
		Addr:        env("ADDR", ":8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		TrustProxy:  os.Getenv("TRUST_PROXY") == "true",
		StaticDir:   os.Getenv("STATIC_DIR"),
		Google:      OAuthClient{ID: os.Getenv("GOOGLE_CLIENT_ID"), Secret: os.Getenv("GOOGLE_CLIENT_SECRET")},
		GitHub:      OAuthClient{ID: os.Getenv("GITHUB_CLIENT_ID"), Secret: os.Getenv("GITHUB_CLIENT_SECRET")},
	}
	if c.DatabaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}

	app, err := url.Parse(strings.TrimSuffix(env("APP_URL", "http://localhost:5173"), "/"))
	if err != nil || app.Scheme == "" || app.Host == "" {
		return nil, fmt.Errorf("APP_URL must be an absolute URL like https://daktilab.example")
	}
	c.AppURL = app
	c.PublicAPIURL = strings.TrimSuffix(env("PUBLIC_API_URL", app.String()+"/api"), "/")

	switch os.Getenv("COOKIE_SECURE") {
	case "true":
		c.CookieSecure = true
	case "false":
		c.CookieSecure = false
	default:
		c.CookieSecure = app.Scheme == "https"
	}
	return c, nil
}

// AppOrigin is AppURL reduced to scheme://host[:port].
func (c *Config) AppOrigin() string { return c.AppURL.Scheme + "://" + c.AppURL.Host }

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
