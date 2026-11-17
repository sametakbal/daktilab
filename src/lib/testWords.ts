import { api, apiEnabled } from "./api";

export type WordLang = "tr" | "en";

/** Fetches a JSON resource from the API; injectable for tests. */
export type Getter = (path: string) => Promise<unknown>;

const apiGet: Getter | null = apiEnabled ? (path) => api<unknown>("GET", path) : null;

/** Enough words for a one-minute test even after dropping ones the layout can't type. */
const BATCH_SIZE = 800;
/** How long "start" may wait for a batch before falling back to the bundled word list. */
const WAIT_MS = 1500;

/** Random words from the database dictionary, or null when unavailable. */
export async function fetchTestWords(lang: WordLang, count = BATCH_SIZE, get: Getter | null = apiGet): Promise<string[] | null> {
  if (!get) return null;
  try {
    const data = await get(`/words?lang=${lang}&count=${count}`);
    if (!Array.isArray(data) || data.length === 0) return null;
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
