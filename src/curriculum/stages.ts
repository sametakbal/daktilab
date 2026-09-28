import type { LayoutId } from "../layouts/types";

export type StageKey = "home" | "top" | "bottom" | "rare" | "caps" | "punct" | "numbers" | "symbols" | "text";

/** How much of the on-screen keyboard is shown during regular exercises. */
export type Visibility = "full" | "faded" | "hidden";

/**
 * A group is one lesson's worth of new keys.
 * - `chars`: literal characters to introduce
 * - `caps`: "left"/"right" introduces capitals of that hand's letters
 * - `text`: a real-text lesson (no new keys)
 */
export type Group = { chars: string[] } | { caps: "left" | "right" } | { text: true };

export interface StageSpec {
  key: StageKey;
  targetWpm: number;
  visibility: Visibility;
  groups: Group[];
  /** Append a review lesson with no new keys. */
  review: boolean;
}

const c = (...chars: string[]): Group => ({ chars });

const tail = (punct: Group[], symbols: Group[]): StageSpec[] => [
  { key: "caps", targetWpm: 16, visibility: "faded", review: true, groups: [{ caps: "left" }, { caps: "right" }] },
  { key: "punct", targetWpm: 18, visibility: "hidden", review: true, groups: punct },
  { key: "numbers", targetWpm: 15, visibility: "faded", review: true, groups: [c("1", "2", "3", "4", "5"), c("6", "7", "8", "9", "0")] },
  { key: "symbols", targetWpm: 14, visibility: "faded", review: true, groups: symbols },
  { key: "text", targetWpm: 25, visibility: "hidden", review: false, groups: [{ text: true }, { text: true }, { text: true }, { text: true }, { text: true }] },
];

export const CURRICULA: Record<LayoutId, StageSpec[]> = {
  "tr-q": [
    { key: "home", targetWpm: 8, visibility: "full", review: true, groups: [c("f", "j"), c("d", "k"), c("s", "l"), c("a", "ş"), c("g", "h"), c("i")] },
    { key: "top", targetWpm: 12, visibility: "full", review: true, groups: [c("r", "u"), c("e", "ı"), c("t", "y"), c("o", "p"), c("ğ", "ü")] },
    { key: "bottom", targetWpm: 14, visibility: "faded", review: true, groups: [c("v", "m"), c("c", "ö"), c("n", "b"), c("z", "ç")] },
    { key: "rare", targetWpm: 15, visibility: "faded", review: false, groups: [c("q", "w", "x")] },
    ...tail(
      [c(".", ","), c("?", "!"), c(":", ";", "-", "'")],
      [c("(", ")", "/", "+"), c("=", "*", "%", "&", '"'), c("@", "#", "$", "€")],
    ),
  ],
  "tr-f": [
    { key: "home", targetWpm: 8, visibility: "full", review: true, groups: [c("a", "k"), c("e", "m"), c("i", "l"), c("u", "y"), c("ü", "t"), c("ş")] },
    { key: "top", targetWpm: 12, visibility: "full", review: true, groups: [c("n", "r"), c("o", "d"), c("ı", "h"), c("g", "ğ"), c("f", "p")] },
    { key: "bottom", targetWpm: 14, visibility: "faded", review: true, groups: [c("s", "c"), c("z", "ç"), c("b", "v"), c("ö", "j")] },
    { key: "rare", targetWpm: 15, visibility: "faded", review: false, groups: [c("x", "q", "w")] },
    ...tail(
      [c(".", ","), c("?", "!"), c(":", ";", "-", "'")],
      [c("(", ")", "/", "+"), c("=", "*", "%", "&", '"'), c("@", "#", "$", "€")],
    ),
  ],
  "en-us": [
    { key: "home", targetWpm: 8, visibility: "full", review: true, groups: [c("f", "j"), c("d", "k"), c("s", "l"), c("a", ";"), c("g", "h")] },
    { key: "top", targetWpm: 12, visibility: "full", review: true, groups: [c("r", "u"), c("e", "i"), c("t", "y"), c("w", "o"), c("q", "p")] },
    { key: "bottom", targetWpm: 14, visibility: "faded", review: true, groups: [c("v", "m"), c("c", ","), c("x", "."), c("b", "n"), c("z", "/")] },
    ...tail(
      [c("?", "!"), c("'", '"', ":", "-")],
      [c("(", ")", "[", "]"), c("=", "+", "*", "&", "%"), c("@", "#", "$", "_")],
    ),
  ],
};
