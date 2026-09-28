import { enUS } from "./en-us";
import { FINGER_OF } from "./physical";
import { trF } from "./tr-f";
import { trQ } from "./tr-q";
import type { KeyStroke, Layout, LayoutId } from "./types";

export const LAYOUTS: Record<LayoutId, Layout> = { "tr-q": trQ, "tr-f": trF, "en-us": enUS };
export const LAYOUT_IDS: LayoutId[] = ["tr-q", "tr-f", "en-us"];

const strokeCache = new Map<LayoutId, Map<string, KeyStroke>>();

/** Reverse map: character → the physical key (and modifiers) that produces it. */
export function strokeMap(layout: Layout): Map<string, KeyStroke> {
  let map = strokeCache.get(layout.id);
  if (map) return map;
  map = new Map();
  // Base layer first so it wins over shifted/AltGr duplicates (e.g. "|").
  for (const layer of ["base", "shift", "altGr"] as const) {
    for (const [code, chars] of Object.entries(layout.keys)) {
      const ch = chars?.[layer];
      if (!ch || map.has(ch)) continue;
      map.set(ch, { code, shift: layer === "shift", altGr: layer === "altGr", finger: FINGER_OF[code] ?? "th" });
    }
  }
  strokeCache.set(layout.id, map);
  return map;
}

export function strokeFor(layout: Layout, ch: string): KeyStroke | undefined {
  return strokeMap(layout).get(ch);
}

export function isLetter(ch: string): boolean {
  return /\p{L}/u.test(ch);
}

export function upper(layout: Layout, ch: string): string {
  return ch.toLocaleUpperCase(layout.locale);
}

export function lower(layout: Layout, ch: string): string {
  return ch.toLocaleLowerCase(layout.locale);
}

/** Label printed on a key cap. */
export function capLabel(layout: Layout, code: string): string {
  const chars = layout.keys[code];
  if (!chars) return "";
  return isLetter(chars.base) ? upper(layout, chars.base) : chars.base;
}

export type { Layout, LayoutId, KeyStroke } from "./types";
