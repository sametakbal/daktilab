-- Large word dictionaries for the typing test. Fill with `go run ./cmd/import-words`.

create table words (
  lang text not null check (lang in ('tr', 'en')),
  -- Dense 1..N per language, so random picks are primary-key lookups instead of a full scan.
  n integer not null,
  word text not null,
  primary key (lang, n)
);

-- Random sample of up to 1000 words: draws random n values, then joins on the primary key.
create function random_words(p_lang text, p_count int)
returns setof text
language sql
volatile
as $$
  with bounds as (
    select max(n) as mx from words where lang = p_lang
  ),
  picks as materialized (
    select 1 + floor(random() * b.mx)::int as n
    from bounds b, generate_series(1, least(greatest(p_count, 0), 1000))
    where b.mx is not null
  )
  select w.word
  from picks p
  join words w on w.lang = p_lang and w.n = p.n;
$$;
