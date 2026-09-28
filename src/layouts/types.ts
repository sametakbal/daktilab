export type Finger = "lp" | "lr" | "lm" | "li" | "ri" | "rm" | "rr" | "rp" | "th";

export const FINGERS: Finger[] = ["lp", "lr", "lm", "li", "ri", "rm", "rr", "rp", "th"];

export type Hand = "left" | "right" | "both";

export function handOf(finger: Finger): Hand {
  if (finger === "th") return "both";
  return finger.startsWith("l") ? "left" : "right";
}

/** Characters a physical key produces in a given layout. */
export interface KeyChars {
  base: string;
  shift?: string;
  altGr?: string;
}

export type LayoutId = "tr-q" | "tr-f" | "en-us";

export interface Layout {
  id: LayoutId;
  /** BCP-47 locale used for case conversion of this layout's letters. */
  locale: "tr" | "en";
  /** ISO boards have the extra key left of Z and a tall Enter. */
  iso: boolean;
  keys: Partial<Record<string, KeyChars>>;
}

/** Where a character lives on the keyboard and how to produce it. */
export interface KeyStroke {
  code: string;
  shift: boolean;
  altGr: boolean;
  finger: Finger;
}
