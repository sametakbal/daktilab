import { createEffect } from "solid-js";
import { createStore, type SetStoreFunction, type Store } from "solid-js/store";

const PREFIX = "daktilab:v1:";

export function readJSON<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage may be full or blocked (private mode); the app keeps working in memory.
  }
}

/**
 * A store that is loaded from and saved to localStorage.
 * `sanitize` merges stored data over defaults so older or corrupt data can't break the app.
 */
export function createPersistentStore<T extends object>(
  key: string,
  defaults: T,
  sanitize: (stored: unknown, defaults: T) => T = (stored, d) => ({ ...d, ...(stored as object) }),
): [Store<T>, SetStoreFunction<T>] {
  let initial = defaults;
  const stored = readJSON<unknown>(key);
  if (stored && typeof stored === "object") {
    try {
      initial = sanitize(stored, defaults);
    } catch {
      initial = defaults;
    }
  }
  const [state, setState] = createStore<T>(initial);
  // JSON.stringify reads every field, so the effect tracks the whole store.
  createEffect(() => writeJSON(key, JSON.parse(JSON.stringify(state))));
  return [state, setState];
}
