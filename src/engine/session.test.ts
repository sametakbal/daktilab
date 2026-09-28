import { describe, expect, it } from "vitest";
import { combine, metrics } from "./metrics";
import { createSession, input, isFinished } from "./session";

const typeAll = (text: string, keys: string[], mode: "stop" | "continue" = "stop", step = 200) => {
  let s = createSession(text, mode);
  keys.forEach((k, i) => (s = input(s, k, 1000 + i * step)));
  return s;
};

describe("session", () => {
  it("advances on correct keys and finishes at the end", () => {
    const s = typeAll("fj", ["f", "j"]);
    expect(s.pos).toBe(2);
    expect(isFinished(s)).toBe(true);
    expect(s.keystrokes).toBe(2);
    expect(s.errorAt.size).toBe(0);
  });

  it("stop mode does not advance on a wrong key", () => {
    const s = typeAll("fj", ["f", "k"]);
    expect(s.pos).toBe(1);
    expect(s.errorAt.has(1)).toBe(true);
    expect(s.lastWrong).toBe("k");
    expect(s.charStats["j"].misses).toBe(1);
    expect(s.bigramMisses["fj"]).toBe(1);
  });

  it("stop mode ignores backspace", () => {
    const s = typeAll("fj", ["f", "Backspace"]);
    expect(s.pos).toBe(1);
  });

  it("continue mode records wrong chars and allows backspace", () => {
    let s = typeAll("fj", ["f", "k"], "continue");
    expect(s.pos).toBe(2);
    expect(isFinished(s)).toBe(true);
    s = typeAll("fjd", ["f", "k", "Backspace", "j", "d"], "continue");
    expect(s.typed.join("")).toBe("fjd");
    expect(s.keystrokes).toBe(4);
    expect(s.correctKeystrokes).toBe(3);
  });

  it("ignores multi-character keys and input after finishing", () => {
    let s = typeAll("f", ["Shift", "f"]);
    expect(s.keystrokes).toBe(1);
    const after = input(s, "x", 9999);
    expect(after).toBe(s);
    s = createSession("i", "stop");
    expect(input(s, "İ", 0).pos).toBe(0);
  });

  it("computes wpm and accuracy", () => {
    // 10 chars in 6 s → 2 words / 0.1 min = 20 wpm
    const text = "abcdeabcde";
    let s = createSession(text, "stop");
    Array.from(text).forEach((ch, i) => (s = input(s, ch, (i * 6000) / 9)));
    const m = metrics(s, 0);
    expect(m.wpm).toBeCloseTo(20, 5);
    expect(m.accuracy).toBe(100);

    const withError = typeAll("ab", ["a", "x", "b"]);
    expect(metrics(withError, 0).accuracy).toBeCloseTo(66.67, 1);
  });

  it("combines exercise metrics", () => {
    const m = combine([
      { wpm: 0, accuracy: 0, durationMs: 30000, chars: 50, keystrokes: 55, errors: 5 },
      { wpm: 0, accuracy: 0, durationMs: 30000, chars: 50, keystrokes: 50, errors: 0 },
    ]);
    expect(m.wpm).toBeCloseTo(20);
    expect(m.accuracy).toBeCloseTo((100 / 105) * 100);
  });
});
