import type { CharStat, Session } from "./session";

export interface Metrics {
  /** Net words per minute (correct characters / 5). */
  wpm: number;
  /** Correct keystrokes / all keystrokes, 0..100. */
  accuracy: number;
  durationMs: number;
  chars: number;
  keystrokes: number;
  errors: number;
}

export function elapsedMs(s: Session, now: number): number {
  if (s.startedAt === null) return 0;
  return (s.finishedAt ?? now) - s.startedAt;
}

export function correctChars(s: Session): number {
  let n = 0;
  for (let i = 0; i < s.typed.length; i++) if (s.typed[i] === s.chars[i]) n++;
  return n;
}

/** Words whose every character has been typed correctly (the word in progress doesn't count). */
export function correctWords(s: Session): number {
  let n = 0;
  let start = 0;
  for (let i = 0; i <= s.chars.length; i++) {
    if (i < s.chars.length && s.chars[i] !== " ") continue;
    if (i > start && s.pos >= i) {
      let ok = true;
      for (let j = start; j < i; j++) if (s.typed[j] !== s.chars[j]) ok = false;
      if (ok) n++;
    }
    start = i + 1;
  }
  return n;
}

export function wpm(chars: number, ms: number): number {
  if (ms <= 0) return 0;
  return chars / 5 / (ms / 60000);
}

export function accuracy(correct: number, total: number): number {
  return total === 0 ? 100 : (correct / total) * 100;
}

export function metrics(s: Session, now: number): Metrics {
  const ms = elapsedMs(s, now);
  const chars = correctChars(s);
  return {
    wpm: wpm(chars, ms),
    accuracy: accuracy(s.correctKeystrokes, s.keystrokes),
    durationMs: ms,
    chars,
    keystrokes: s.keystrokes,
    errors: s.keystrokes - s.correctKeystrokes,
  };
}

/** Combine the metrics of several consecutive exercises. */
export function combine(parts: Metrics[]): Metrics {
  const durationMs = parts.reduce((a, p) => a + p.durationMs, 0);
  const chars = parts.reduce((a, p) => a + p.chars, 0);
  const keystrokes = parts.reduce((a, p) => a + p.keystrokes, 0);
  const errors = parts.reduce((a, p) => a + p.errors, 0);
  return { wpm: wpm(chars, durationMs), accuracy: accuracy(keystrokes - errors, keystrokes), durationMs, chars, keystrokes, errors };
}

export function mergeCharStats(a: Record<string, CharStat>, b: Record<string, CharStat>): Record<string, CharStat> {
  const out = { ...a };
  for (const [ch, s] of Object.entries(b)) {
    const p = out[ch];
    out[ch] = p
      ? {
          hits: p.hits + s.hits,
          misses: p.misses + s.misses,
          latencySum: p.latencySum + s.latencySum,
          latencyCount: p.latencyCount + s.latencyCount,
        }
      : { ...s };
  }
  return out;
}
