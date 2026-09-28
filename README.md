# daktilab

**English** | [Türkçe](README.tr.md)

An open-source web app that teaches touch typing step by step. Built with SolidJS + TypeScript + Tailwind CSS. Progress is always stored in the browser (localStorage); an optional Supabase backend adds accounts, cloud sync, a one-minute test and a global leaderboard (see below).

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
  lib/          Supabase client, leaderboard queries, test word fetching
  i18n/         TR/EN dictionaries
  components/   Keyboard, Hands, TypingArea, Runner, ResultCard, LineChart…
  pages/        Home, Lessons, Lesson, Practice, Test, Leaderboard, Stats, Settings, Login, Onboarding
scripts/        import-words.mjs (loads dictionary files into Supabase)
supabase/       SQL migrations
```

## Backend setup (optional)

The app works fully without a backend (localStorage). Accounts, cross-device progress sync and the global leaderboard need a [Supabase](https://supabase.com) project:

1. Create a new Supabase project; under Authentication → Providers enable **Email** and, if you like, **Google**/**GitHub** OAuth.
2. Run the migrations in [supabase/migrations/](supabase/migrations/) in order in the SQL Editor (all safe to re-run):
   - `0001_init.sql`: tables and RLS policies
   - `0002_words.sql`: the test dictionary
   - `0003_ranked_test.sql`: server-scored tests. Clients can't write scores; `start_test()` picks the passage and records the start time, and `finish_test()` scores the typed text against it and updates the leaderboard. It also seeds the dictionary with the bundled word lists.
3. Copy the **Project URL** and **anon public key** from Project Settings → API.
4. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
5. `npm run dev` — sign in, pick a username, finish the test on `/test` and see your result on `/leaderboard`.

If these variables are empty the app runs in offline mode automatically; the `/login`, `/leaderboard` and `/test` pages say so.

### Test dictionary (optional)

The one-minute test pulls its words from a large dictionary in the database. Each attempt fetches ~800 random words through the `random_words` RPC, and the next batch is prefetched. If the table is empty or unreachable, the small bundled word lists are used instead.

1. Make sure `0002_words.sql` and `0003_ranked_test.sql` have been run (see above).
2. Copy the **service_role** key from Project Settings → API and add it to `.env.local` as `SUPABASE_SERVICE_ROLE_KEY=...`. This key bypasses RLS: **never give it a `VITE_` prefix**, or it will be shipped to the browser.
3. Import the word files (one word per line; safe to re-run):

   ```sh
   node --env-file=.env.local scripts/import-words.mjs en ../ALL_ENGLISH_WORDS.txt
   node --env-file=.env.local --max-old-space-size=4096 scripts/import-words.mjs tr ../ALL_TURKISH_WORDS.txt
   ```

   The script lowercases each line, keeps only 2–20 letter words made of that language's letters, and removes duplicates. The Turkish file (~6.6 million words) takes roughly 500–700 MB in the database, which is more than the Supabase free plan allows.
