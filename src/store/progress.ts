import { createRoot } from "solid-js";
import { produce } from "solid-js/store";
import { allLessons, type Lesson } from "../curriculum/generator";
import type { Metrics } from "../engine/metrics";
import type { CharStat } from "../engine/session";
import { LAYOUTS } from "../layouts";
import type { LayoutId } from "../layouts/types";
import { createPersistentStore } from "./persist";

export interface LessonRecord {
  bestWpm: number;
  bestAcc: number;
  stars: number;
  attempts: number;
  lastAt: number;
}

export interface CharRecord extends CharStat {
  lastSeen: number;
}

export interface LayoutProgress {
  lessons: Record<string, LessonRecord>;
  chars: Record<string, CharRecord>;
  bigrams: Record<string, number>;
}

export interface HistoryEntry {
  at: number;
  layout: LayoutId;
  /** Lesson id, or "practice". */
  lesson: string;
  wpm: number;
  acc: number;
  ms: number;
  chars: number;
}

export interface Progress {
  layouts: Partial<Record<LayoutId, LayoutProgress>>;
  history: HistoryEntry[];
}

export const HISTORY_LIMIT = 500;
/** Once a key has this many samples, older data is halved so recent practice counts more. */
const DECAY_AT = 200;
export const PASS_ACCURACY = 94;

const empty = (): Progress => ({ layouts: {}, history: [] });

function sanitize(stored: unknown, d: Progress): Progress {
  const s = stored as Partial<Progress>;
  return {
    layouts: s.layouts && typeof s.layouts === "object" ? s.layouts : d.layouts,
    history: Array.isArray(s.history) ? s.history.slice(-HISTORY_LIMIT) : d.history,
  };
}

export const [progress, setProgress] = createRoot(() => createPersistentStore<Progress>("progress", empty(), sanitize));

export function layoutProgress(id: LayoutId): LayoutProgress {
  return progress.layouts[id] ?? { lessons: {}, chars: {}, bigrams: {} };
}

export function starsFor(m: Pick<Metrics, "wpm" | "accuracy">, targetWpm: number): number {
  if (m.accuracy < PASS_ACCURACY || m.wpm < targetWpm) return 0;
  if (m.accuracy >= 98 && m.wpm >= targetWpm * 1.4) return 3;
  if (m.accuracy >= 96 && m.wpm >= targetWpm * 1.2) return 2;
  return 1;
}

export interface RecordInput {
  layout: LayoutId;
  lesson: Lesson | null;
  metrics: Metrics;
  charStats: Record<string, CharStat>;
  bigramMisses: Record<string, number>;
}

export interface RecordOutcome {
  stars: number;
  previousStars: number;
  newBest: boolean;
}

export function recordResult({ layout, lesson, metrics, charStats, bigramMisses }: RecordInput): RecordOutcome {
  const now = Date.now();
  const prev = lesson ? layoutProgress(layout).lessons[lesson.id] : undefined;
  const stars = lesson ? starsFor(metrics, lesson.targetWpm) : 0;
  const outcome: RecordOutcome = {
    stars,
    previousStars: prev?.stars ?? 0,
    newBest: !!prev && metrics.wpm > prev.bestWpm && metrics.accuracy >= PASS_ACCURACY,
  };

  setProgress(
    produce((p) => {
      const lp = (p.layouts[layout] ??= { lessons: {}, chars: {}, bigrams: {} });
      if (lesson) {
        const r = lp.lessons[lesson.id];
        lp.lessons[lesson.id] = {
          bestWpm: Math.max(r?.bestWpm ?? 0, metrics.wpm),
          bestAcc: Math.max(r?.bestAcc ?? 0, metrics.accuracy),
          stars: Math.max(r?.stars ?? 0, stars),
          attempts: (r?.attempts ?? 0) + 1,
          lastAt: now,
        };
      }
      for (const [ch, s] of Object.entries(charStats)) {
        let c = lp.chars[ch] ?? { hits: 0, misses: 0, latencySum: 0, latencyCount: 0, lastSeen: now };
        if (c.hits + c.misses > DECAY_AT) {
          c = { hits: c.hits / 2, misses: c.misses / 2, latencySum: c.latencySum / 2, latencyCount: c.latencyCount / 2, lastSeen: c.lastSeen };
        }
        lp.chars[ch] = {
          hits: c.hits + s.hits,
          misses: c.misses + s.misses,
          latencySum: c.latencySum + s.latencySum,
          latencyCount: c.latencyCount + s.latencyCount,
          lastSeen: now,
        };
      }
      for (const [bg, n] of Object.entries(bigramMisses)) lp.bigrams[bg] = (lp.bigrams[bg] ?? 0) + n;
      p.history.push({
        at: now,
        layout,
        lesson: lesson?.id ?? "practice",
        wpm: Math.round(metrics.wpm * 10) / 10,
        acc: Math.round(metrics.accuracy * 10) / 10,
        ms: Math.round(metrics.durationMs),
        chars: metrics.chars,
      });
      if (p.history.length > HISTORY_LIMIT) p.history.splice(0, p.history.length - HISTORY_LIMIT);
    }),
  );
  return outcome;
}

export function isUnlocked(layout: LayoutId, lesson: Lesson, unlockAll: boolean): boolean {
  if (unlockAll || lesson.index === 0) return true;
  const lessons = allLessons(LAYOUTS[layout]);
  const prev = lessons[lesson.index - 1];
  return (layoutProgress(layout).lessons[prev.id]?.stars ?? 0) > 0;
}

/** First lesson that has not been passed yet. */
export function nextLesson(layout: LayoutId): Lesson {
  const lessons = allLessons(LAYOUTS[layout]);
  const done = layoutProgress(layout).lessons;
  return lessons.find((l) => !(done[l.id]?.stars > 0)) ?? lessons[lessons.length - 1];
}

/** Characters from every passed lesson (at least the first lesson's keys). */
export function learnedChars(layout: LayoutId): string[] {
  const lessons = allLessons(LAYOUTS[layout]);
  const done = layoutProgress(layout).lessons;
  let last = lessons[0];
  for (const l of lessons) if (done[l.id]?.stars > 0 && l.kind !== "text") last = l;
  return last.allowed;
}

export interface KeyInsight {
  ch: string;
  samples: number;
  missRate: number;
  avgLatency: number;
  daysSince: number;
  /** 0..1, higher means needs more practice. */
  weakness: number;
}

export function keyInsights(layout: LayoutId, chars?: string[]): KeyInsight[] {
  const stats = layoutProgress(layout).chars;
  const now = Date.now();
  const entries = Object.entries(stats).filter(([ch, s]) => ch !== " " && s.hits + s.misses >= 3 && (!chars || chars.includes(ch)));
  const latencies = entries.map(([, s]) => (s.latencyCount ? s.latencySum / s.latencyCount : 0)).filter((x) => x > 0).sort((a, b) => a - b);
  const median = latencies[Math.floor(latencies.length / 2)] || 300;
  return entries.map(([ch, s]) => {
    const samples = s.hits + s.misses;
    const missRate = s.misses / samples;
    const avgLatency = s.latencyCount ? s.latencySum / s.latencyCount : median;
    const daysSince = (now - s.lastSeen) / 86400000;
    const slow = Math.max(0, avgLatency / median - 1);
    const stale = Math.min(1, daysSince / 7);
    const weakness = Math.min(1, missRate * 5 + slow * 0.6 + stale * 0.3);
    return { ch, samples, missRate, avgLatency, daysSince, weakness };
  });
}

export function weaknessMap(layout: LayoutId, chars?: string[]): Record<string, number> {
  return Object.fromEntries(keyInsights(layout, chars).map((k) => [k.ch, k.weakness]));
}

/** Consecutive days (ending today or yesterday) with at least one session. */
export function streakDays(history: HistoryEntry[]): number {
  const days = new Set(history.map((h) => new Date(h.at).toDateString()));
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(d.toDateString())) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function resetProgress(): void {
  setProgress(empty());
}

export function importProgress(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Partial<Progress>;
  if (!d.layouts || !Array.isArray(d.history)) return false;
  setProgress(sanitize(d, empty()));
  return true;
}
