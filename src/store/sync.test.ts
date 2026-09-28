import { describe, expect, it } from "vitest";
import type { Progress } from "./progress";
import { mergeProgress } from "./sync";

const empty = (): Progress => ({ layouts: {}, history: [] });

describe("mergeProgress", () => {
    it("keeps the higher per-field lesson stats from either side", () => {
        const local: Progress = {
            layouts: { "en-us": { lessons: { "home-1": { bestWpm: 20, bestAcc: 95, stars: 2, attempts: 3, lastAt: 100 } }, chars: {}, bigrams: {} } },
            history: [],
        };
        const remote: Progress = {
            layouts: { "en-us": { lessons: { "home-1": { bestWpm: 30, bestAcc: 90, stars: 1, attempts: 5, lastAt: 50 } }, chars: {}, bigrams: {} } },
            history: [],
        };
        const merged = mergeProgress(local, remote);
        expect(merged.layouts["en-us"]!.lessons["home-1"]).toEqual({ bestWpm: 30, bestAcc: 95, stars: 2, attempts: 5, lastAt: 100 });
    });

    it("unions history by timestamp without duplicates, sorted ascending", () => {
        const local: Progress = { layouts: {}, history: [{ at: 200, layout: "en-us", lesson: "practice", wpm: 40, acc: 95, ms: 1000, chars: 10 }] };
        const remote: Progress = {
            layouts: {},
            history: [
                { at: 100, layout: "en-us", lesson: "practice", wpm: 30, acc: 90, ms: 1000, chars: 8 },
                { at: 200, layout: "en-us", lesson: "practice", wpm: 40, acc: 95, ms: 1000, chars: 10 },
            ],
        };
        const merged = mergeProgress(local, remote);
        expect(merged.history.map((h) => h.at)).toEqual([100, 200]);
    });

    it("is a no-op when merging with an empty snapshot", () => {
        const local: Progress = {
            layouts: { "tr-q": { lessons: { a: { bestWpm: 10, bestAcc: 90, stars: 1, attempts: 1, lastAt: 1 } }, chars: {}, bigrams: {} } },
            history: [{ at: 1, layout: "tr-q", lesson: "a", wpm: 10, acc: 90, ms: 500, chars: 5 }],
        };
        expect(mergeProgress(local, empty())).toEqual(local);
    });

    it("keeps the char record with more total samples", () => {
        const local: Progress = {
            layouts: { "en-us": { lessons: {}, chars: { f: { hits: 5, misses: 1, latencySum: 500, latencyCount: 5, lastSeen: 10 } }, bigrams: {} } },
            history: [],
        };
        const remote: Progress = {
            layouts: { "en-us": { lessons: {}, chars: { f: { hits: 20, misses: 2, latencySum: 2000, latencyCount: 20, lastSeen: 5 } }, bigrams: {} } },
            history: [],
        };
        const merged = mergeProgress(local, remote);
        expect(merged.layouts["en-us"]!.chars.f.hits).toBe(20);
    });
});
