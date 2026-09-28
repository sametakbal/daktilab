-- daktilab backend schema: profiles, cloud progress sync, daily test leaderboard, streaks.
-- Run in the Supabase SQL editor (or via the Supabase CLI). Idempotent: safe to re-run.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.progress_sync (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_test_scores (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  layout text not null check (layout in ('tr-q', 'tr-f', 'en-us')),
  test_date date not null,
  wpm numeric not null check (wpm between 0 and 400),
  accuracy numeric not null check (accuracy between 0 and 100),
  created_at timestamptz not null default now()
);

create index if not exists daily_test_scores_user_idx on public.daily_test_scores (user_id, layout);

create table if not exists public.personal_bests (
  user_id uuid not null references auth.users (id) on delete cascade,
  layout text not null check (layout in ('tr-q', 'tr-f', 'en-us')),
  best_wpm numeric not null check (best_wpm between 0 and 400),
  best_accuracy numeric not null check (best_accuracy between 0 and 100),
  achieved_at timestamptz not null default now(),
  primary key (user_id, layout)
);

create table if not exists public.user_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_practice_date date,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.progress_sync enable row level security;
alter table public.daily_test_scores enable row level security;
alter table public.personal_bests enable row level security;
alter table public.user_stats enable row level security;

-- profiles: usernames are public (leaderboard needs them), only the owner can write.
drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable" on public.profiles for select using (true);
drop policy if exists "profiles are writable by owner" on public.profiles;
create policy "profiles are writable by owner" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles are updatable by owner" on public.profiles;
create policy "profiles are updatable by owner" on public.profiles for update using (auth.uid() = id);

-- progress_sync: private, owner-only in both directions.
drop policy if exists "progress_sync is owner-only" on public.progress_sync;
create policy "progress_sync is owner-only" on public.progress_sync for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- daily_test_scores: append-only log, public read (leaderboard), owner-insert only.
drop policy if exists "daily_test_scores are publicly readable" on public.daily_test_scores;
create policy "daily_test_scores are publicly readable" on public.daily_test_scores for select using (true);
drop policy if exists "daily_test_scores are insertable by owner" on public.daily_test_scores;
create policy "daily_test_scores are insertable by owner" on public.daily_test_scores for insert with check (auth.uid() = user_id);

-- personal_bests / user_stats: public read (leaderboard), owner write.
drop policy if exists "personal_bests are publicly readable" on public.personal_bests;
create policy "personal_bests are publicly readable" on public.personal_bests for select using (true);
drop policy if exists "personal_bests are writable by owner" on public.personal_bests;
create policy "personal_bests are writable by owner" on public.personal_bests for insert with check (auth.uid() = user_id);
drop policy if exists "personal_bests are updatable by owner" on public.personal_bests;
create policy "personal_bests are updatable by owner" on public.personal_bests for update using (auth.uid() = user_id);

drop policy if exists "user_stats are publicly readable" on public.user_stats;
create policy "user_stats are publicly readable" on public.user_stats for select using (true);
drop policy if exists "user_stats are writable by owner" on public.user_stats;
create policy "user_stats are writable by owner" on public.user_stats for insert with check (auth.uid() = user_id);
drop policy if exists "user_stats are updatable by owner" on public.user_stats;
create policy "user_stats are updatable by owner" on public.user_stats for update using (auth.uid() = user_id);

-- Leaderboard queries embed profiles(username); PostgREST needs a direct FK to profiles for that.
-- Rows from users without a profile can't be shown by name, so they're dropped before the FK is added.
delete from public.personal_bests where user_id not in (select id from public.profiles);
delete from public.user_stats where user_id not in (select id from public.profiles);
alter table public.personal_bests drop constraint if exists personal_bests_profile_fkey;
alter table public.personal_bests add constraint personal_bests_profile_fkey foreign key (user_id) references public.profiles (id) on delete cascade;
alter table public.user_stats drop constraint if exists user_stats_profile_fkey;
alter table public.user_stats add constraint user_stats_profile_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

notify pgrst, 'reload schema';
