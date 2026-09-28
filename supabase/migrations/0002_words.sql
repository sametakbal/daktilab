-- Large word dictionaries for the typing test. Idempotent: safe to re-run.
-- Fill it with scripts/import-words.mjs (service role key); clients only read via random_words().

create table if not exists public.words (
  lang text not null check (lang in ('tr', 'en')),
  -- Dense 1..N per language, so random picks are primary-key lookups instead of a full scan.
  n integer not null,
  word text not null,
  primary key (lang, n)
);

alter table public.words enable row level security;

drop policy if exists "words are publicly readable" on public.words;
create policy "words are publicly readable" on public.words for select using (true);

-- Random sample of up to 1000 words: draws random n values, then joins on the primary key.
create or replace function public.random_words(p_lang text, p_count int)
returns setof text
language sql
volatile
as $$
  with bounds as (
    select max(n) as mx from public.words where lang = p_lang
  ),
  picks as materialized (
    select 1 + floor(random() * b.mx)::int as n
    from bounds b, generate_series(1, least(greatest(p_count, 0), 1000))
    where b.mx is not null
  )
  select w.word
  from picks p
  join public.words w on w.lang = p_lang and w.n = p.n;
$$;

grant execute on function public.random_words(text, int) to anon, authenticated;

notify pgrst, 'reload schema';
