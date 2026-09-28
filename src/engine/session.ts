export type ErrorMode = "stop" | "continue";

export interface CharStat {
  hits: number;
  misses: number;
  /** Sum and count of time-to-press for correct hits, in ms. */
  latencySum: number;
  latencyCount: number;
}

export interface Session {
  chars: string[];
  mode: ErrorMode;
  pos: number;
  /** What the user actually typed at each position (continue mode may hold wrong chars). */
  typed: string[];
  /** Positions where at least one wrong key was pressed. */
  errorAt: Set<number>;
  keystrokes: number;
  correctKeystrokes: number;
  startedAt: number | null;
  lastAt: number | null;
  finishedAt: number | null;
  charStats: Record<string, CharStat>;
  /** Two-char sequences ("prev+expected") that were mistyped. */
  bigramMisses: Record<string, number>;
  /** Wrong key pressed on the last input (for feedback). */
  lastWrong: string | null;
}

export function createSession(text: string, mode: ErrorMode): Session {
  return {
    chars: Array.from(text.normalize("NFC")),
    mode,
    pos: 0,
    typed: [],
    errorAt: new Set(),
    keystrokes: 0,
    correctKeystrokes: 0,
    startedAt: null,
    lastAt: null,
    finishedAt: null,
    charStats: {},
    bigramMisses: {},
    lastWrong: null,
  };
}

export function isFinished(s: Session): boolean {
  return s.finishedAt !== null;
}

export function expectedChar(s: Session): string | undefined {
  return s.chars[s.pos];
}

function bump(stats: Record<string, CharStat>, ch: string, hit: boolean, latency: number | null): Record<string, CharStat> {
  const prev = stats[ch] ?? { hits: 0, misses: 0, latencySum: 0, latencyCount: 0 };
  const next: CharStat = hit
    ? {
        ...prev,
        hits: prev.hits + 1,
        latencySum: prev.latencySum + (latency ?? 0),
        latencyCount: prev.latencyCount + (latency === null ? 0 : 1),
      }
    : { ...prev, misses: prev.misses + 1 };
  return { ...stats, [ch]: next };
}

/** Longest gap counted as typing latency; longer pauses are treated as breaks. */
const MAX_LATENCY_MS = 3000;

/**
 * Feed one key (a produced character, or "Backspace") into the session.
 * Returns the same object when the key is ignored.
 */
export function input(s: Session, key: string, now: number): Session {
  if (isFinished(s)) return s;

  if (key === "Backspace") {
    if (s.mode === "stop" || s.pos === 0) return s;
    return { ...s, pos: s.pos - 1, typed: s.typed.slice(0, -1), lastWrong: null };
  }

  const ch = key.normalize("NFC");
  if (Array.from(ch).length !== 1) return s;

  const expected = s.chars[s.pos];
  const startedAt = s.startedAt ?? now;
  const gap = s.lastAt === null ? null : now - s.lastAt;
  const latency = gap !== null && gap <= MAX_LATENCY_MS ? gap : null;
  const correct = ch === expected;

  let next: Session = {
    ...s,
    startedAt,
    lastAt: now,
    keystrokes: s.keystrokes + 1,
    charStats: bump(s.charStats, expected, correct, latency),
  };

  if (correct) {
    next.correctKeystrokes = s.correctKeystrokes + 1;
    next.typed = [...s.typed, ch];
    next.pos = s.pos + 1;
    next.lastWrong = null;
  } else {
    const errorAt = new Set(s.errorAt);
    errorAt.add(s.pos);
    next.errorAt = errorAt;
    next.lastWrong = ch;
    if (s.pos > 0) {
      const bg = s.chars[s.pos - 1] + expected;
      next.bigramMisses = { ...s.bigramMisses, [bg]: (s.bigramMisses[bg] ?? 0) + 1 };
    }
    if (s.mode === "continue") {
      next.typed = [...s.typed, ch];
      next.pos = s.pos + 1;
    }
  }

  if (next.pos >= next.chars.length) next.finishedAt = now;
  return next;
}
