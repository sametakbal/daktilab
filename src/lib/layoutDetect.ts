import { LAYOUT_IDS, LAYOUTS, lower } from "../layouts";
import type { LayoutId } from "../layouts/types";

export interface KeySample {
  code: string;
  key: string;
  shift: boolean;
}

function matches(id: LayoutId, s: KeySample): boolean | null {
  const layout = LAYOUTS[id];
  const chars = layout.keys[s.code];
  if (!chars) return null;
  const expected = s.shift ? chars.shift : chars.base;
  if (!expected) return null;
  return lower(layout, expected) === lower(layout, s.key);
}

/** Share of samples that agree with a layout (null when no sample is comparable). */
export function agreement(id: LayoutId, samples: KeySample[]): number | null {
  let n = 0;
  let ok = 0;
  for (const s of samples) {
    const m = matches(id, s);
    if (m === null) continue;
    n++;
    if (m) ok++;
  }
  return n === 0 ? null : ok / n;
}

/** The layout that best explains what the OS produced, if clearly better than the current one. */
export function suggestLayout(current: LayoutId, samples: KeySample[]): { mismatch: boolean; suggestion: LayoutId | null } {
  const cur = agreement(current, samples);
  if (cur === null || samples.length < 8 || cur >= 0.7) return { mismatch: false, suggestion: null };
  let best: LayoutId | null = null;
  let bestScore = cur;
  for (const id of LAYOUT_IDS) {
    const a = agreement(id, samples);
    if (a !== null && a > bestScore + 0.2) {
      best = id;
      bestScore = a;
    }
  }
  return { mismatch: true, suggestion: best };
}
