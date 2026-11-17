-- Accounts, sessions, profiles, cloud progress sync, daily test leaderboard, streaks.
-- Access control lives in the API layer (there is no RLS): every query is scoped to the session's user.

create table users (
  id uuid primary key default gen_random_uuid(),
  -- Lowercased. Null for OAuth accounts whose provider gave no verified email.
  email text unique,
  -- argon2id (PHC string) or bcrypt (accounts imported from Supabase; rehashed on next login).
  password_hash text,
  created_at timestamptz not null default now()
);

create table user_identities (
  provider text not null check (provider in ('google', 'github')),
  provider_user_id text not null,
  user_id uuid not null references users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  primary key (provider, provider_user_id)
);

create index user_identities_user_idx on user_identities (user_id);

create table sessions (
  -- sha256 of the cookie token; the token itself is never stored.
  token_hash bytea primary key,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index sessions_user_idx on sessions (user_id);
create index sessions_expires_idx on sessions (expires_at);

create table profiles (
  id uuid primary key references users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now()
);

create unique index profiles_username_key on profiles (lower(username));

create table progress_sync (
  user_id uuid primary key references users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table daily_test_scores (
  id bigserial primary key,
  user_id uuid not null references users (id) on delete cascade,
  layout text not null check (layout in ('tr-q', 'tr-f', 'en-us')),
  test_date date not null,
  wpm numeric not null check (wpm between 0 and 400),
  accuracy numeric not null check (accuracy between 0 and 100),
  created_at timestamptz not null default now()
);

create index daily_test_scores_user_idx on daily_test_scores (user_id, created_at desc);

-- Leaderboard tables reference profiles: only users with a username appear on the boards.
create table personal_bests (
  user_id uuid not null references profiles (id) on delete cascade,
  layout text not null check (layout in ('tr-q', 'tr-f', 'en-us')),
  best_wpm numeric not null check (best_wpm between 0 and 400),
  best_accuracy numeric not null check (best_accuracy between 0 and 100),
  achieved_at timestamptz not null default now(),
  primary key (user_id, layout)
);

create index personal_bests_board_idx on personal_bests (layout, best_wpm desc);

create table user_stats (
  user_id uuid primary key references profiles (id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_practice_date date,
  updated_at timestamptz not null default now()
);

create index user_stats_board_idx on user_stats (longest_streak desc);
