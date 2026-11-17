package api

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

var validLayouts = map[string]bool{"tr-q": true, "tr-f": true, "en-us": true}

// --- profile ---

var usernamePattern = regexp.MustCompile(`^[\p{L}\p{N}_.-]+$`)

func validUsername(name string) bool {
	n := utf8.RuneCountInString(name)
	return n >= 3 && n <= 24 && usernamePattern.MatchString(name)
}

// putProfile claims a username on first login, or renames later.
func (s *Server) putProfile(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		Username string `json:"username"`
	}
	if !readJSON(w, r, defaultBodyLimit, &in) {
		return
	}
	name := strings.TrimSpace(in.Username)
	if !validUsername(name) {
		writeError(w, http.StatusBadRequest, "username must be 3–24 letters, digits, '_', '.' or '-'")
		return
	}
	_, err := s.db.Exec(r.Context(),
		"insert into profiles (id, username) values ($1, $2) on conflict (id) do update set username = excluded.username",
		uid, name)
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "this username is taken")
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, profileJSON{ID: uid, Username: name})
}

// --- progress sync ---

const progressBodyLimit = 4 << 20

func (s *Server) getProgress(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	var data json.RawMessage
	var updated time.Time
	err := s.db.QueryRow(r.Context(), "select data, updated_at from progress_sync where user_id = $1", uid).Scan(&data, &updated)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusOK, map[string]any{"data": nil, "updatedAt": nil})
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data, "updatedAt": updated})
}

func (s *Server) putProgress(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		Data json.RawMessage `json:"data"`
	}
	if !readJSON(w, r, progressBodyLimit, &in) {
		return
	}
	var probe map[string]json.RawMessage
	if json.Unmarshal(in.Data, &probe) != nil || probe == nil {
		writeError(w, http.StatusBadRequest, "data must be a JSON object")
		return
	}
	_, err := s.db.Exec(r.Context(), `insert into progress_sync (user_id, data, updated_at) values ($1, $2, now())
		on conflict (user_id) do update set data = excluded.data, updated_at = now()`, uid, in.Data)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- daily test scores ---

// A test lasts 60 s; anything faster than this between submissions can't be a real attempt.
const minSecondsBetweenScores = 45

type scoreInput struct {
	Layout        string  `json:"layout"`
	WPM           float64 `json:"wpm"`
	Accuracy      float64 `json:"accuracy"`
	CurrentStreak int     `json:"currentStreak"`
}

func (in scoreInput) validate() string {
	switch {
	case !validLayouts[in.Layout]:
		return "unknown layout"
	case math.IsNaN(in.WPM) || in.WPM < 0 || in.WPM > 400:
		return "wpm must be between 0 and 400"
	case math.IsNaN(in.Accuracy) || in.Accuracy < 0 || in.Accuracy > 100:
		return "accuracy must be between 0 and 100"
	case in.CurrentStreak < 0 || in.CurrentStreak > 100_000:
		return "invalid streak"
	}
	return ""
}

// postScore records a daily-test attempt and updates the personal best and streak boards in one transaction.
func (s *Server) postScore(w http.ResponseWriter, r *http.Request) {
	uid, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	var in scoreInput
	if !readJSON(w, r, defaultBodyLimit, &in) {
		return
	}
	if msg := in.validate(); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}

	var status int
	var newBest bool
	err := pgx.BeginFunc(r.Context(), s.db, func(tx pgx.Tx) error {
		// Lock the user's row so two concurrent submissions can't both pass the spacing check.
		var hasProfile bool
		var accountDays int
		err := tx.QueryRow(r.Context(), `select exists(select 1 from profiles where id = u.id), current_date - u.created_at::date + 1
			from users u where u.id = $1 for update`, uid).Scan(&hasProfile, &accountDays)
		if err != nil {
			return err
		}
		if !hasProfile {
			status = http.StatusForbidden
			return nil
		}
		var recent bool
		if err := tx.QueryRow(r.Context(), `select exists(select 1 from daily_test_scores
			where user_id = $1 and created_at > now() - make_interval(secs => $2))`, uid, minSecondsBetweenScores).Scan(&recent); err != nil {
			return err
		}
		if recent {
			status = http.StatusTooManyRequests
			return nil
		}

		// The streak comes from the client's local history; it can't predate the account.
		streak := min(in.CurrentStreak, accountDays)

		if _, err := tx.Exec(r.Context(), `insert into daily_test_scores (user_id, layout, test_date, wpm, accuracy)
			values ($1, $2, current_date, $3, $4)`, uid, in.Layout, in.WPM, in.Accuracy); err != nil {
			return err
		}
		tag, err := tx.Exec(r.Context(), `insert into personal_bests (user_id, layout, best_wpm, best_accuracy, achieved_at)
			values ($1, $2, $3, $4, now())
			on conflict (user_id, layout) do update
			set best_wpm = excluded.best_wpm, best_accuracy = excluded.best_accuracy, achieved_at = excluded.achieved_at
			where excluded.best_wpm > personal_bests.best_wpm`, uid, in.Layout, in.WPM, in.Accuracy)
		if err != nil {
			return err
		}
		newBest = tag.RowsAffected() > 0
		_, err = tx.Exec(r.Context(), `insert into user_stats (user_id, current_streak, longest_streak, last_practice_date, updated_at)
			values ($1, $2, $2, current_date, now())
			on conflict (user_id) do update
			set current_streak = excluded.current_streak,
			    longest_streak = greatest(user_stats.longest_streak, excluded.current_streak),
			    last_practice_date = excluded.last_practice_date,
			    updated_at = excluded.updated_at`, uid, streak)
		return err
	})
	switch {
	case err != nil:
		s.internalError(w, r, err)
	case status == http.StatusForbidden:
		writeError(w, status, "pick a username before submitting scores")
	case status == http.StatusTooManyRequests:
		writeError(w, status, "a score was submitted moments ago")
	default:
		writeJSON(w, http.StatusOK, map[string]bool{"newPersonalBest": newBest})
	}
}

// --- leaderboards ---

type leaderboardEntry struct {
	Username string  `json:"username"`
	Value    float64 `json:"value"`
}

func limitParam(r *http.Request) int {
	n, err := strconv.Atoi(r.URL.Query().Get("limit"))
	if err != nil || n <= 0 {
		return 50
	}
	return min(n, 100)
}

func (s *Server) wpmLeaderboard(w http.ResponseWriter, r *http.Request) {
	layout := r.URL.Query().Get("layout")
	if !validLayouts[layout] {
		writeError(w, http.StatusBadRequest, "unknown layout")
		return
	}
	s.writeBoard(w, r, `select p.username, pb.best_wpm::float8 from personal_bests pb
		join profiles p on p.id = pb.user_id
		where pb.layout = $1 order by pb.best_wpm desc, pb.achieved_at asc limit $2`, layout, limitParam(r))
}

func (s *Server) streakLeaderboard(w http.ResponseWriter, r *http.Request) {
	s.writeBoard(w, r, `select p.username, us.longest_streak::float8 from user_stats us
		join profiles p on p.id = us.user_id
		where us.longest_streak > 0
		order by us.longest_streak desc, us.updated_at asc limit $1`, limitParam(r))
}

func (s *Server) writeBoard(w http.ResponseWriter, r *http.Request, sql string, args ...any) {
	rows, err := s.db.Query(r.Context(), sql, args...)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	entries, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (leaderboardEntry, error) {
		var e leaderboardEntry
		return e, row.Scan(&e.Username, &e.Value)
	})
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if entries == nil {
		entries = []leaderboardEntry{}
	}
	writeJSON(w, http.StatusOK, entries)
}

// --- test words ---

func (s *Server) words(w http.ResponseWriter, r *http.Request) {
	lang := r.URL.Query().Get("lang")
	if lang != "tr" && lang != "en" {
		writeError(w, http.StatusBadRequest, "lang must be tr or en")
		return
	}
	count, err := strconv.Atoi(r.URL.Query().Get("count"))
	if err != nil || count <= 0 {
		count = 800
	}
	rows, err := s.db.Query(r.Context(), "select random_words($1, $2)", lang, min(count, 1000))
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	words, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if words == nil {
		words = []string{}
	}
	writeJSON(w, http.StatusOK, words)
}
