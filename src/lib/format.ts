import type { Lesson } from "../curriculum/generator";
import { t } from "../i18n";
import { isLetter, upper } from "../layouts";
import type { Layout } from "../layouts/types";

export function keyName(layout: Layout, ch: string): string {
  if (ch === " ") return "␣";
  return isLetter(ch) ? upper(layout, ch) : ch;
}

export function lessonTitle(layout: Layout, lesson: Lesson): string {
  switch (lesson.kind) {
    case "review":
      return t("lesson.review");
    case "text":
      return t("lesson.text", { n: lesson.number });
    case "caps":
      return lesson.shift === "left" ? t("lesson.capsLeft") : t("lesson.capsRight");
    default:
      return t("lesson.newKeys", { keys: lesson.newChars.map((c) => keyName(layout, c)).join(" ") });
  }
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return t("common.seconds", { n: s });
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}:${String(s % 60).padStart(2, "0")}`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export const round = (n: number) => Math.round(n);
/** Accuracy is floored so 99.7% with an error never reads as a perfect 100%. */
export const pct = (n: number) => `${Math.floor(n)}%`;
