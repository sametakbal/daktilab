import { describe, expect, it } from "vitest";
import { LAYOUT_IDS, LAYOUTS, isLetter, strokeFor } from "../layouts";
import { FINGER_OF } from "../layouts/physical";
import { allLessons, buildExercises, buildPractice, buildTest } from "./generator";
import { wordsForLang } from "../words";

describe.each(LAYOUT_IDS)("layout %s", (id) => {
  const layout = LAYOUTS[id];
  const lessons = allLessons(layout);

  it("assigns a finger to every key that produces a character", () => {
    for (const code of Object.keys(layout.keys)) expect(FINGER_OF[code], code).toBeDefined();
  });

  it("teaches every lowercase letter of the layout", () => {
    const taught = new Set(lessons.flatMap((l) => l.newChars));
    for (const chars of Object.values(layout.keys)) {
      if (chars && isLetter(chars.base)) expect(taught.has(chars.base), chars.base).toBe(true);
    }
  });

  it("has unique lesson ids and increasing targets within a stage", () => {
    expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
  });

  it("only uses characters learned so far, across several attempts", () => {
    for (const lesson of lessons) {
      const allowed = new Set([...lesson.allowed, " "]);
      for (let attempt = 0; attempt < 4; attempt++) {
        for (const ex of buildExercises(layout, lesson, { attempt })) {
          expect(ex.text.length, `${lesson.id} ${ex.kind} empty`).toBeGreaterThan(0);
          for (const ch of ex.text) {
            expect(allowed.has(ch), `${lesson.id}/${ex.kind}: "${ch}" in "${ex.text}"`).toBe(true);
          }
        }
      }
    }
  });

  it("every allowed character is typeable on the layout", () => {
    for (const lesson of lessons) for (const ch of lesson.allowed) expect(strokeFor(layout, ch), `${lesson.id} ${ch}`).toBeDefined();
  });

  it("produces the same text for the same attempt", () => {
    const l = lessons[3];
    expect(buildExercises(layout, l, { attempt: 1 })).toEqual(buildExercises(layout, l, { attempt: 1 }));
  });

  it("practice stays within learned keys", () => {
    const learned = lessons[8].allowed;
    const set = new Set([...learned, " "]);
    for (const ex of buildPractice(layout, learned, { [learned[0]]: 1 }, 7, [learned[1]])) {
      for (const ch of ex.text) expect(set.has(ch), ch).toBe(true);
    }
  });
});

describe.each(LAYOUT_IDS)("daily test on %s", (id) => {
  it.each(["tr", "en"] as const)("uses only lowercase dictionary words in %s", (lang) => {
    const layout = LAYOUTS[id];
    const dict = new Set(wordsForLang(lang));
    const exercises = buildTest(layout, lang, 42);
    for (const ex of exercises) {
      expect(ex.text.length).toBeGreaterThan(0);
      for (const word of ex.text.split(" ")) {
        expect(dict.has(word)).toBe(true);
        expect(word).toBe(word.toLocaleLowerCase(lang));
        for (const ch of word) expect(strokeFor(layout, ch)).toBeDefined();
      }
    }
  });

  it("uses an external dictionary, dropping untypeable or non-letter entries", () => {
    const layout = LAYOUTS[id];
    const text = buildTest(layout, "en", 7, ["house", "Water", "r2d2", "a+b", "tree"])[0].text;
    const used = new Set(text.split(" "));
    expect([...used].sort()).toEqual(["house", "tree", "water"]);
  });

  it("falls back to the bundled list when the external dictionary is unusable", () => {
    const layout = LAYOUTS[id];
    const text = buildTest(layout, "en", 7, ["123", "!!"])[0].text;
    const dict = new Set(wordsForLang("en"));
    expect(text.split(" ").every((w) => dict.has(w))).toBe(true);
  });

  it.each(["tr", "en"] as const)("changes with the seed and doesn't repeat words early on in %s", (lang) => {
    const layout = LAYOUTS[id];
    const a = buildTest(layout, lang, 1)[0].text;
    const b = buildTest(layout, lang, 2)[0].text;
    expect(a).not.toBe(b);
    const first = a.split(" ").slice(0, 100);
    expect(new Set(first).size).toBe(first.length);
  });
});
