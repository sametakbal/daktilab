import { handOf } from "../layouts/types";
import { isLetter, lower, strokeFor, strokeMap, upper } from "../layouts";
import { HOME_KEYS } from "../layouts/physical";
import type { Layout } from "../layouts/types";
import { createRng, hashString } from "../lib/rng";
import { drillText, type GenOptions, introText, sentenceText, splitAlphabet, wordsText } from "../engine/textgen";
import { sentencesFor, wordsFor } from "../words";
import { CURRICULA, type StageKey, type Visibility } from "./stages";

export type LessonKind = "keys" | "caps" | "review" | "text";

export interface Lesson {
  id: string;
  stage: StageKey;
  stageIndex: number;
  /** 1-based position inside the stage. */
  number: number;
  /** 0-based position in the whole curriculum. */
  index: number;
  kind: LessonKind;
  newChars: string[];
  /** Every character that may appear in this lesson (space is always allowed). */
  allowed: string[];
  targetWpm: number;
  visibility: Visibility;
  /** Capitals lessons: which Shift key is being practised. */
  shift?: "left" | "right";
}

export interface Stage {
  key: StageKey;
  index: number;
  lessons: Lesson[];
}

export type ExerciseKind = "intro" | "drill" | "words" | "review" | "text";

export interface Exercise {
  kind: ExerciseKind;
  text: string;
}

const cache = new Map<string, Stage[]>();

const SUFFIXES = { tr: ["in", "ın", "un", "ün", "a", "e", "de", "da", "te", "ta", "ye", "ya", "nin", "nın", "ler", "lar"], en: ["s", "t", "ll", "re", "ve", "d"] };

/** Intro exercises stay short; capitals lessons show a representative subset. */
const MAX_INTRO_CHARS = 6;

const freqCache = new Map<string, Map<string, number>>();

/** Letter frequency in the layout's dictionary, scaled to 0.4..2 so rare letters appear less in drills. */
function letterWeights(layout: Layout): Map<string, number> {
  let w = freqCache.get(layout.locale);
  if (w) return w;
  const counts = new Map<string, number>();
  for (const word of wordsFor(layout)) for (const ch of word) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const max = Math.max(...counts.values());
  w = new Map([...counts].map(([ch, n]) => [ch, 0.4 + (1.6 * n) / max]));
  freqCache.set(layout.locale, w);
  return w;
}

export function curriculum(layout: Layout): Stage[] {
  const cached = cache.get(layout.id);
  if (cached) return cached;

  const typeable = strokeMap(layout);
  const allChars = [...typeable.keys()];
  const known: string[] = [];
  const stages: Stage[] = [];
  let index = 0;

  CURRICULA[layout.id].forEach((spec, stageIndex) => {
    const lessons: Lesson[] = [];
    const push = (kind: LessonKind, newChars: string[], allowed: string[], shift?: "left" | "right") => {
      const number = lessons.length + 1;
      lessons.push({
        id: `${spec.key}-${number}`,
        stage: spec.key,
        stageIndex,
        number,
        index: index++,
        kind,
        newChars,
        allowed,
        targetWpm: spec.key === "text" ? spec.targetWpm + (number - 1) * 4 : spec.targetWpm,
        visibility: spec.visibility,
        ...(shift ? { shift } : {}),
      });
    };

    for (const group of spec.groups) {
      if ("chars" in group) {
        const fresh = group.chars.filter((ch) => typeable.has(ch) && !known.includes(ch));
        if (fresh.length === 0) continue;
        known.push(...fresh);
        push("keys", fresh, [...known]);
      } else if ("caps" in group) {
        // Left Shift is pressed with the left pinky, so it capitalises right-hand letters.
        const hand = group.caps === "left" ? "right" : "left";
        const fresh = known
          .filter((ch) => isLetter(ch) && lower(layout, ch) === ch)
          .filter((ch) => handOf(strokeFor(layout, ch)!.finger) === hand)
          .map((ch) => upper(layout, ch))
          .filter((ch) => typeable.has(ch) && !known.includes(ch));
        if (fresh.length === 0) continue;
        known.push(...fresh);
        push("caps", fresh, [...known], group.caps);
      } else {
        push("text", [], allChars);
      }
    }
    if (spec.review) push("review", [], [...known]);
    stages.push({ key: spec.key, index: stageIndex, lessons });
  });

  cache.set(layout.id, stages);
  return stages;
}

export function allLessons(layout: Layout): Lesson[] {
  return curriculum(layout).flatMap((s) => s.lessons);
}

export function findLesson(layout: Layout, id: string): Lesson | undefined {
  return allLessons(layout).find((l) => l.id === id);
}

/** Home-row key of the finger that types `ch`, if the learner already knows it. */
function anchorFor(layout: Layout, allowed: Set<string>, ch: string): string | undefined {
  const stroke = strokeFor(layout, ch);
  if (!stroke) return undefined;
  const code = HOME_KEYS[stroke.finger];
  const anchor = code ? layout.keys[code]?.base : undefined;
  return anchor && allowed.has(anchor) && anchor !== " " ? anchor : undefined;
}

export interface BuildOptions {
  /** Changes on every attempt so repeated lessons are not memorised as text. */
  attempt?: number;
  /** Extra weight (0..1) per character from the learner's weak-key history. */
  weakness?: Record<string, number>;
}

export function buildExercises(layout: Layout, lesson: Lesson, opts: BuildOptions = {}): Exercise[] {
  const rng = createRng(hashString(`${layout.id}:${lesson.id}`) ^ (opts.attempt ?? 0));
  const allowed = new Set(lesson.allowed);
  const toLower = (ch: string) => lower(layout, ch);
  const toUpper = (ch: string) => upper(layout, ch);
  const alphabet = splitAlphabet(lesson.allowed, toLower);
  const fresh = new Set(lesson.newChars);
  const weak = opts.weakness ?? {};
  const dict = wordsFor(layout);

  const freq = letterWeights(layout);
  const freshMarks = lesson.newChars.some((ch) => alphabet.marks.includes(ch));
  const freshDigits = lesson.newChars.some((ch) => alphabet.digits.includes(ch));

  const base = (length: number, freshBoost: number, weakBoost: number): GenOptions => ({
    rng,
    alphabet,
    length,
    toUpper,
    markRate: freshMarks ? 0.6 : 0.2,
    digitRate: freshDigits ? 0.4 : 0.1,
    suffixes: SUFFIXES[layout.locale],
    weight: (ch) => (freq.get(ch) ?? 1) + (fresh.has(ch) ? freshBoost : 0) + (weak[ch] ?? 0) * weakBoost,
  });

  switch (lesson.kind) {
    case "text":
      return [
        { kind: "text", text: sentenceText(rng, sentencesFor(layout), (ch) => allowed.has(ch) || ch === " ", 120) },
        { kind: "text", text: sentenceText(rng, sentencesFor(layout), (ch) => allowed.has(ch) || ch === " ", 160) },
      ];
    case "review":
      return [
        { kind: "drill", text: drillText(base(70, 0, 3)) },
        { kind: "words", text: wordsText(base(90, 0, 1), dict) },
        { kind: "review", text: wordsText(base(90, 0, 4), dict) },
      ];
    default:
      return [
        { kind: "intro", text: introText(rng, lesson.newChars.slice(0, MAX_INTRO_CHARS), (ch) => anchorFor(layout, allowed, ch), toLower) },
        { kind: "drill", text: drillText(base(60, 3, 1)) },
        { kind: "words", text: wordsText(base(90, 2, 1), dict) },
        { kind: "review", text: wordsText(base(90, 1, 3), dict) },
      ];
  }
}

/** Free practice over an arbitrary set of learned characters, weighted by weakness. */
export function buildPractice(layout: Layout, learned: string[], weakness: Record<string, number>, seed: number, focus: string[] = []): Exercise[] {
  const lesson: Lesson = {
    id: "practice",
    stage: "home",
    stageIndex: 0,
    number: 0,
    index: -1,
    kind: "review",
    newChars: focus,
    allowed: learned,
    targetWpm: 0,
    visibility: "full",
  };
  const exercises = buildExercises(layout, lesson, { attempt: seed, weakness });
  if (focus.length === 0) return exercises;
  // Put a focused drill first when the learner picked keys explicitly.
  const rng = createRng(seed);
  const alphabet = splitAlphabet(learned, (ch) => lower(layout, ch));
  const focusSet = new Set(focus);
  return [
    { kind: "drill", text: drillText({ rng, alphabet, length: 70, toUpper: (ch) => upper(layout, ch), weight: (ch) => (focusSet.has(ch) ? 6 : 1) }) },
    ...exercises,
  ];
}
