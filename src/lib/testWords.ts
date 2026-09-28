import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type WordLang = "tr" | "en";

/** Enough words for a one-minute test even after dropping ones the layout can't type. */
const BATCH_SIZE = 800;
/** How long "start" may wait for a batch before falling back to the bundled word list. */
const WAIT_MS = 1500;

/** Random words from the database dictionary, or null when unavailable. */
export async function fetchTestWords(lang: WordLang, count = BATCH_SIZE, client: SupabaseClient | null = supabase): Promise<string[] | null> {
  if (!client) return null;
  try {
    const { data, error } = await client.rpc("random_words", { p_lang: lang, p_count: count });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return data as string[];
  } catch {
    return null;
  }
}

/** One batch per language is kept ready so starting a test never waits on the network. */
const pending = new Map<WordLang, Promise<string[] | null>>();

export function prefetchTestWords(lang: WordLang): void {
  if (!pending.has(lang)) pending.set(lang, fetchTestWords(lang));
}

/** Hands out the prefetched batch (waiting briefly if needed) and starts fetching the next one. */
export async function takeTestWords(lang: WordLang): Promise<string[] | null> {
  prefetchTestWords(lang);
  const batch = pending.get(lang)!;
  pending.delete(lang);
  prefetchTestWords(lang);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), WAIT_MS)));
  const words = await Promise.race([batch, timeout]);
  clearTimeout(timer);
  return words;
}
