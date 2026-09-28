// Loads a one-word-per-line dictionary into public.words (see supabase/migrations/0002_words.sql).
//
//   node --env-file=.env --max-old-space-size=4096 scripts/import-words.mjs <tr|en> <file>
//
// Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service role key bypasses RLS:
// never prefix it with VITE_, or Vite will ship it to the browser.
// Safe to re-run: rows are upserted by (lang, n) and leftovers beyond the new count are removed.

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

const LETTERS = { tr: /^[a-zçğıöşü]+$/u, en: /^[a-z]+$/ };
const MIN_LEN = 2;
const MAX_LEN = 20;
const BATCH = 5000;
const PARALLEL = 4;

const [lang, file] = process.argv.slice(2);
if (!LETTERS[lang] || !file) {
  console.error("usage: node --env-file=.env scripts/import-words.mjs <tr|en> <file>");
  process.exit(1);
}
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function readWords() {
  const seen = new Set();
  const lines = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of lines) {
    const w = line.trim().normalize("NFC").toLocaleLowerCase(lang);
    const len = Array.from(w).length;
    if (len >= MIN_LEN && len <= MAX_LEN && LETTERS[lang].test(w)) seen.add(w);
  }
  return [...seen];
}

async function upload(words) {
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < words.length) {
      const start = next;
      next += BATCH;
      const rows = words.slice(start, start + BATCH).map((word, i) => ({ lang, n: start + i + 1, word }));
      for (let attempt = 1; ; attempt++) {
        const { error } = await supabase.from("words").upsert(rows, { onConflict: "lang,n" });
        if (!error) break;
        if (attempt >= 5) throw new Error(`batch at ${start}: ${error.message}`);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
      done += rows.length;
      process.stdout.write(`\r${lang}: ${done.toLocaleString()} / ${words.length.toLocaleString()}`);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  process.stdout.write("\n");
}

const t0 = Date.now();
const words = await readWords();
console.log(`${lang}: ${words.length.toLocaleString()} unique words after cleaning`);
await upload(words);
const { error } = await supabase.from("words").delete().eq("lang", lang).gt("n", words.length);
if (error) throw new Error(`cleanup: ${error.message}`);
console.log(`${lang}: done in ${Math.round((Date.now() - t0) / 1000)}s`);
