import type { Layout } from "../layouts/types";
import { EN_SENTENCES, EN_WORDS } from "./en";
import { TR_SENTENCES, TR_WORDS } from "./tr";

/** Word language follows the keyboard layout, not the UI language. */
export function wordsFor(layout: Layout): string[] {
  return layout.locale === "tr" ? TR_WORDS : EN_WORDS;
}

export function sentencesFor(layout: Layout): string[] {
  return layout.locale === "tr" ? TR_SENTENCES : EN_SENTENCES;
}
