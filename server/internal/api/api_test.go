package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sametakbal/daktilab/server/internal/config"
	"github.com/sametakbal/daktilab/server/internal/db"
	"golang.org/x/crypto/bcrypt"
)

// Integration tests run against a throwaway database:
//
//	TEST_DATABASE_URL=postgres://localhost/daktilab_test go test ./...
//
// They drop and recreate the public schema, so never point this at real data.
func newTestServer(t *testing.T) (*httptest.Server, *pgxpool.Pool) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.Open(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if _, err := pool.Exec(ctx, "drop schema public cascade; create schema public"); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	app, _ := url.Parse("http://app.test")
	cfg := &config.Config{AppURL: app, PublicAPIURL: "http://app.test/api"}
	ts := httptest.NewServer(New(cfg, pool).Handler())
	t.Cleanup(ts.Close)
	return ts, pool
}

type client struct {
	t    *testing.T
	base string
	http *http.Client
}

func newClient(t *testing.T, ts *httptest.Server) *client {
	jar, _ := cookiejar.New(nil)
	return &client{t: t, base: ts.URL, http: &http.Client{Jar: jar}}
}

func (c *client) do(method, path string, body any, out any, headers ...string) int {
	c.t.Helper()
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.base+path, r)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	res, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	if out != nil {
		if err := json.NewDecoder(res.Body).Decode(out); err != nil {
			c.t.Fatalf("%s %s: decode: %v", method, path, err)
		}
	}
	return res.StatusCode
}

func expect(t *testing.T, what string, got, want int) {
	t.Helper()
	if got != want {
		t.Fatalf("%s: status %d, want %d", what, got, want)
	}
}

func TestAccountFlow(t *testing.T) {
	ts, _ := newTestServer(t)
	c := newClient(t, ts)

	var me meJSON
	expect(t, "me signed out", c.do("GET", "/api/auth/me", nil, &me), 200)
	if me.User != nil {
		t.Fatal("expected no user before signing in")
	}

	creds := credentials{Email: "Ada@Example.com", Password: "s3cret-pass"}
	expect(t, "signup", c.do("POST", "/api/auth/signup", creds, &me), 200)
	if me.User == nil || *me.User.Email != "ada@example.com" || me.Profile != nil {
		t.Fatalf("signup response = %+v", me)
	}
	expect(t, "duplicate signup", newClient(t, ts).do("POST", "/api/auth/signup", creds, nil), 409)
	expect(t, "short password", newClient(t, ts).do("POST", "/api/auth/signup", credentials{Email: "b@example.com", Password: "short"}, nil), 400)
	expect(t, "bad email", newClient(t, ts).do("POST", "/api/auth/signup", credentials{Email: "nope", Password: "long-enough"}, nil), 400)

	// Scores need a username first.
	score := scoreInput{Layout: "tr-q", WPM: 42.5, Accuracy: 97, CurrentStreak: 3}
	expect(t, "score without profile", c.do("POST", "/api/scores", score, nil), 403)

	var p profileJSON
	expect(t, "invalid username", c.do("PUT", "/api/profile", map[string]string{"username": "a"}, nil), 400)
	expect(t, "claim username", c.do("PUT", "/api/profile", map[string]string{"username": "ada"}, &p), 200)
	if p.Username != "ada" {
		t.Fatalf("profile = %+v", p)
	}

	other := newClient(t, ts)
	expect(t, "second signup", other.do("POST", "/api/auth/signup", credentials{Email: "grace@example.com", Password: "another-pass"}, nil), 200)
	expect(t, "username taken (case-insensitive)", other.do("PUT", "/api/profile", map[string]string{"username": "ADA"}, nil), 409)

	// Progress sync round trip.
	var prog struct {
		Data json.RawMessage `json:"data"`
	}
	expect(t, "empty progress", c.do("GET", "/api/progress", nil, &prog), 200)
	if string(prog.Data) != "null" {
		t.Fatalf("empty progress data = %s", prog.Data)
	}
	snapshot := map[string]any{"layouts": map[string]any{}, "history": []any{map[string]any{"at": 1}}}
	expect(t, "put progress", c.do("PUT", "/api/progress", map[string]any{"data": snapshot}, nil), 204)
	expect(t, "progress must be an object", c.do("PUT", "/api/progress", map[string]any{"data": []int{1}}, nil), 400)
	expect(t, "get progress", c.do("GET", "/api/progress", nil, &prog), 200)
	var back map[string]any
	_ = json.Unmarshal(prog.Data, &back)
	if len(back["history"].([]any)) != 1 {
		t.Fatalf("progress round trip = %s", prog.Data)
	}

	// Scores: first one is a personal best; a second within the cool-down is rejected.
	var res map[string]bool
	expect(t, "score", c.do("POST", "/api/scores", score, &res), 200)
	if !res["newPersonalBest"] {
		t.Fatal("first score should be a personal best")
	}
	expect(t, "score cool-down", c.do("POST", "/api/scores", score, nil), 429)
	expect(t, "invalid score", c.do("POST", "/api/scores", scoreInput{Layout: "dvorak", WPM: 10}, nil), 400)

	var board []leaderboardEntry
	expect(t, "wpm board", c.do("GET", "/api/leaderboard/wpm?layout=tr-q", nil, &board), 200)
	if len(board) != 1 || board[0].Username != "ada" || board[0].Value != 42.5 {
		t.Fatalf("wpm board = %+v", board)
	}
	expect(t, "streak board", c.do("GET", "/api/leaderboard/streak", nil, &board), 200)
	// The account is a day old at most, so the client's claimed streak of 3 is capped to 1.
	if len(board) != 1 || board[0].Value != 1 {
		t.Fatalf("streak board = %+v", board)
	}
	expect(t, "bad layout", c.do("GET", "/api/leaderboard/wpm?layout=x", nil, nil), 400)

	// Cross-site writes are refused (CSRF), same-origin and the configured app origin are fine.
	expect(t, "cross-site write", c.do("PUT", "/api/profile", map[string]string{"username": "evil"}, nil, "Sec-Fetch-Site", "cross-site", "Origin", "https://evil.example"), 403)
	expect(t, "app-origin write", c.do("PUT", "/api/profile", map[string]string{"username": "ada"}, nil, "Sec-Fetch-Site", "cross-site", "Origin", "http://app.test"), 200)

	// Log out, log back in with the wrong and right password.
	expect(t, "logout", c.do("POST", "/api/auth/logout", nil, nil), 204)
	expect(t, "me after logout", c.do("GET", "/api/auth/me", nil, &me), 200)
	if me.User != nil {
		t.Fatal("still signed in after logout")
	}
	expect(t, "progress after logout", c.do("GET", "/api/progress", nil, nil), 401)
	expect(t, "wrong password", c.do("POST", "/api/auth/login", credentials{Email: "ada@example.com", Password: "nope-nope"}, nil), 401)
	expect(t, "unknown email", c.do("POST", "/api/auth/login", credentials{Email: "x@example.com", Password: "nope-nope"}, nil), 401)
	expect(t, "login", c.do("POST", "/api/auth/login", credentials{Email: "ADA@example.com", Password: "s3cret-pass"}, &me), 200)
	if me.Profile == nil || me.Profile.Username != "ada" {
		t.Fatalf("login response = %+v", me)
	}
}

func TestBcryptUserFromSupabaseIsRehashed(t *testing.T) {
	ts, pool := newTestServer(t)
	ctx := context.Background()
	legacy, _ := bcrypt.GenerateFromPassword([]byte("old-password"), bcrypt.MinCost)
	if _, err := pool.Exec(ctx, "insert into users (email, password_hash) values ('old@example.com', $1)", string(legacy)); err != nil {
		t.Fatal(err)
	}
	expect(t, "legacy login", newClient(t, ts).do("POST", "/api/auth/login", credentials{Email: "old@example.com", Password: "old-password"}, nil), 200)
	var hash string
	_ = pool.QueryRow(ctx, "select password_hash from users where email = 'old@example.com'").Scan(&hash)
	if hash[:10] != "$argon2id$" {
		t.Fatalf("hash not upgraded: %s", hash[:10])
	}
}

func TestOAuthIdentityLinking(t *testing.T) {
	ts, pool := newTestServer(t)
	_ = ts
	s := &Server{db: pool}
	ctx := context.Background()

	var pw meJSON
	expect(t, "signup", newClient(t, ts).do("POST", "/api/auth/signup", credentials{Email: "lin@example.com", Password: "password1"}, &pw), 200)

	linked, err := s.userForIdentity(ctx, "github", identity{ID: "1", Email: "LIN@example.com", EmailVerified: true})
	if err != nil || linked != pw.User.ID {
		t.Fatalf("verified email should link to the password account: %v, %v", linked, err)
	}
	again, _ := s.userForIdentity(ctx, "github", identity{ID: "1"})
	if again != linked {
		t.Fatal("same identity should resolve to the same user")
	}
	unverified, err := s.userForIdentity(ctx, "google", identity{ID: "g", Email: "lin@example.com", EmailVerified: false})
	if err != nil || unverified == linked {
		t.Fatalf("unverified email must not link to an existing account: %v, %v", unverified, err)
	}
}

func TestWords(t *testing.T) {
	ts, pool := newTestServer(t)
	if _, err := pool.Exec(context.Background(), "insert into words (lang, n, word) values ('tr', 1, 'ev'), ('tr', 2, 'su')"); err != nil {
		t.Fatal(err)
	}
	c := newClient(t, ts)
	var words []string
	expect(t, "words", c.do("GET", "/api/words?lang=tr&count=5", nil, &words), 200)
	if len(words) != 5 {
		t.Fatalf("got %d words, want 5", len(words))
	}
	expect(t, "empty language", c.do("GET", "/api/words?lang=en", nil, &words), 200)
	if len(words) != 0 {
		t.Fatalf("got %v, want none", words)
	}
	expect(t, "bad lang", c.do("GET", "/api/words?lang=de", nil, nil), 400)
}

func TestSafeRedirect(t *testing.T) {
	app, _ := url.Parse("http://localhost:5173")
	s := &Server{cfg: &config.Config{AppURL: app}}
	cases := map[string]string{
		"http://localhost:5173/#/login":   "http://localhost:5173/#/login",
		"https://evil.example/":           "http://localhost:5173/",
		"http://localhost:5173.evil.com/": "http://localhost:5173/",
		"http://user@localhost:5173/":     "http://localhost:5173/",
		"//evil.example":                  "http://localhost:5173/",
		"":                                "http://localhost:5173/",
	}
	for in, want := range cases {
		if got := s.safeRedirect(in); got != want {
			t.Errorf("safeRedirect(%q) = %q, want %q", in, got, want)
		}
	}
	if got := withQuery("http://localhost:5173/#/login", "oauth_error", "access_denied"); got != "http://localhost:5173/?oauth_error=access_denied#/login" {
		t.Errorf("withQuery = %q", got)
	}
}

func TestRateLimiter(t *testing.T) {
	l := newRateLimiter(2, 60e9)
	if !l.allow("a") || !l.allow("a") || l.allow("a") {
		t.Fatal("third request in the window should be refused")
	}
	if !l.allow("b") {
		t.Fatal("keys are independent")
	}
}
