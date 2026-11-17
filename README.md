# daktilab

**English** | [Türkçe](README.tr.md)

An open-source web app that teaches touch typing step by step. Built with SolidJS + TypeScript + Tailwind CSS. Progress is always stored in the browser (localStorage); an optional Go backend (`server/`) adds accounts, cloud sync, a one-minute test and a global leaderboard (see below).

- Keyboard layouts: **Turkish Q**, **Turkish F**, **English (US)**
- Interface: English / Türkçe

## Commands

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest: typing engine + curriculum tests
npm run build    # dist/ (static, deployable anywhere; uses HashRouter)
```

## How it works

- **Curriculum** ([src/curriculum/stages.ts](src/curriculum/stages.ts)): the order in which keys are introduced for each layout. Home row → top row → bottom row → capitals → punctuation → digits → symbols → real text.
- **Lessons** ([src/curriculum/generator.ts](src/curriculum/generator.ts)): each lesson introduces 1–3 new keys in four steps: intro → drill → words → reinforce. Texts only use characters learned so far (enforced by tests) and change on every attempt.
- **One-minute test**: real lowercase words in the interface language, different on every attempt. The timer starts with the first key; the score is the number of words typed correctly in 60 seconds. When the window loses focus the text blurs and the timer pauses.
- **Typing engine** ([src/engine/session.ts](src/engine/session.ts)): pure functions, independent of the UI. Records hits, misses and latency per key, plus mistyped bigrams.
- **Muscle-memory mechanics**: finger-coloured on-screen keyboard and hand diagram, a keyboard that fades and hides as you progress, a hint after a 1.5 s pause, "stop on error" mode, adaptive practice weighted towards weak keys, spaced repetition, metronome.
- **Layout check**: if the keys you press (`KeyboardEvent.code` + `key`) don't match the selected layout, a warning suggests the right one.
- **Unlocking**: passing a lesson with 94% accuracy and the stage's target speed unlocks the next one; 1–3 stars.

## Structure

```
src/
  layouts/      layout data (KeyboardEvent.code → character) + physical keyboard/finger mapping
  curriculum/   stages and the lesson/drill/test generator
  engine/       typing session, metrics, text generator
  words/        bundled TR/EN word lists and sentences
  store/        settings, progress (localStorage), auth + cloud sync
  lib/          API client, leaderboard queries, test word fetching
  i18n/         TR/EN dictionaries
  components/   Keyboard, Hands, TypingArea, Runner, ResultCard, LineChart…
  pages/        Home, Lessons, Lesson, Practice, Test, Leaderboard, Stats, Settings, Login, Onboarding
server/         Go API: auth, sync, leaderboard, words (cmd/api, cmd/import-words)
```

## Backend setup (optional)

The app works fully without a backend (localStorage). Accounts, cross-device progress sync and the global leaderboard need the Go API in [server/](server) and a PostgreSQL 13+ database. The API applies its own schema migrations on startup.

### Local development

1. Start Postgres, e.g. `docker compose up -d db` (or any local Postgres with an empty database).
2. Start the API:

   ```sh
   cd server
   DATABASE_URL=postgres://daktilab:daktilab@localhost:5432/daktilab?sslmode=disable go run ./cmd/api
   ```

3. Copy `.env.example` to `.env.local` (it contains `VITE_API_URL=/api`) and run `npm run dev`. Vite proxies `/api` to `localhost:8080`, so the session cookie is same-origin.
4. Sign up, pick a username, finish the test on `/test` and see your result on `/leaderboard`.

If `VITE_API_URL` is empty the app runs in offline mode; the `/login`, `/leaderboard` and `/test` pages say so.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — (required) | Postgres connection string |
| `ADDR` | `:8080` | Listen address |
| `APP_URL` | `http://localhost:5173` | Where the frontend is served. OAuth only redirects back to this origin; it is also the one allowed CORS origin |
| `PUBLIC_API_URL` | `$APP_URL/api` | API base as browsers see it; OAuth callbacks are `$PUBLIC_API_URL/auth/oauth/{google,github}/callback` |
| `COOKIE_SECURE` | `true` if `APP_URL` is https | `Secure` flag on cookies |
| `TRUST_PROXY` | `false` | Read the client IP from `X-Forwarded-For` (rate limiting); enable only behind your own proxy |
| `STATIC_DIR` | — | Also serve this directory (the built `dist/`) at `/` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Enables "Continue with Google" |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | — | Enables "Continue with GitHub" |

### Production

The [Dockerfile](Dockerfile) builds one image that serves the frontend and the API on port 8080. Try it locally with `docker compose up --build` and open http://localhost:8080. In production, set `APP_URL` to your public https URL and register `$APP_URL/api/auth/oauth/google/callback` (and `/github/callback`) as OAuth redirect URIs.

Sessions are HttpOnly cookies (30 days, sliding). Passwords are hashed with argon2id. Cross-site writes are rejected (CSRF), and sign-in/sign-up is rate-limited per IP. Scores go through server-side checks: ranges, one submission per 45 s, and a streak that can't be older than the account.

### Test dictionary (optional)

The one-minute test pulls its words from a large dictionary in the database. Each attempt fetches ~800 random words from `GET /api/words`, and the next batch is prefetched. If the table is empty or unreachable, the small bundled word lists are used instead.

Import the word files (one word per line; replaces that language's words, safe to re-run):

```sh
cd server
export DATABASE_URL=postgres://…
go run ./cmd/import-words en ../../ALL_ENGLISH_WORDS.txt
go run ./cmd/import-words tr ../../ALL_TURKISH_WORDS.txt
```

The importer lowercases each line using the language's rules (Turkish `I` → `ı`). It keeps only words of 2–20 letters made of that language's letters and removes duplicates. The Turkish file (~6.6 million words) takes roughly 500–700 MB in the database.

### Moving data over from Supabase

The schema keeps Supabase's ids and table shapes, so existing data can be copied over. Start the API once against the new database so the tables exist, then:

```sh
OLD=postgres://…supabase…   NEW=postgres://…new…
psql "$OLD" -c "\copy (select id, lower(email), encrypted_password, created_at from auth.users) to users.csv csv"
psql "$OLD" -c "\copy (select provider, provider_id, user_id, lower(email), created_at from auth.identities where provider in ('google','github')) to identities.csv csv"
psql "$NEW" -c "\copy users (id, email, password_hash, created_at) from users.csv csv"
psql "$NEW" -c "\copy user_identities (provider, provider_user_id, user_id, email, created_at) from identities.csv csv"
for t in profiles progress_sync daily_test_scores personal_bests user_stats words; do
  psql "$OLD" -c "\copy public.$t to $t.csv csv" && psql "$NEW" -c "\copy $t from $t.csv csv"
done
psql "$NEW" -c "select setval('daily_test_scores_id_seq', (select coalesce(max(id), 1) from daily_test_scores))"
```

Supabase stores passwords as bcrypt, and the API accepts those as-is, rehashing each one to argon2id on its next sign-in. Nobody needs to reset their password.
