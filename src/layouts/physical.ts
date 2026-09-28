import type { Finger } from "./types";

/** Standard touch-typing finger assignment, keyed by KeyboardEvent.code. */
export const FINGER_OF: Record<string, Finger> = {
  Backquote: "lp", Digit1: "lp", Digit2: "lr", Digit3: "lm", Digit4: "li", Digit5: "li",
  Digit6: "ri", Digit7: "ri", Digit8: "rm", Digit9: "rr", Digit0: "rp", Minus: "rp", Equal: "rp",
  KeyQ: "lp", KeyW: "lr", KeyE: "lm", KeyR: "li", KeyT: "li",
  KeyY: "ri", KeyU: "ri", KeyI: "rm", KeyO: "rr", KeyP: "rp", BracketLeft: "rp", BracketRight: "rp",
  KeyA: "lp", KeyS: "lr", KeyD: "lm", KeyF: "li", KeyG: "li",
  KeyH: "ri", KeyJ: "ri", KeyK: "rm", KeyL: "rr", Semicolon: "rp", Quote: "rp", Backslash: "rp",
  IntlBackslash: "lp", KeyZ: "lp", KeyX: "lr", KeyC: "lm", KeyV: "li", KeyB: "li",
  KeyN: "ri", KeyM: "ri", Comma: "rm", Period: "rr", Slash: "rp",
  Space: "th",
  ShiftLeft: "lp", ShiftRight: "rp", AltRight: "th",
};

/** Resting position of each finger. */
export const HOME_KEYS: Partial<Record<Finger, string>> = {
  lp: "KeyA", lr: "KeyS", lm: "KeyD", li: "KeyF",
  ri: "KeyJ", rm: "KeyK", rr: "KeyL", rp: "Semicolon",
  th: "Space",
};

export interface PhysicalKey {
  code: string;
  /** Width in key units (1u = a letter key). */
  w: number;
  /** Non-character keys get a fixed label. */
  label?: string;
}

const row = (codes: string[]): PhysicalKey[] => codes.map((code) => ({ code, w: 1 }));
const digits = ["Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"];
const top = ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight"];
const home = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"];
const bottom = ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"];

const spaceRow: PhysicalKey[] = [
  { code: "ControlLeft", w: 1.25, label: "Ctrl" },
  { code: "MetaLeft", w: 1.25, label: "⌘" },
  { code: "AltLeft", w: 1.25, label: "Alt" },
  { code: "Space", w: 6.25, label: "" },
  { code: "AltRight", w: 1.25, label: "AltGr" },
  { code: "MetaRight", w: 1.25, label: "⌘" },
  { code: "ControlRight", w: 2.5, label: "Ctrl" },
];

/** Rows of a 15u-wide board. */
export function physicalRows(iso: boolean): PhysicalKey[][] {
  if (iso) {
    return [
      [...row(digits), { code: "Backspace", w: 2, label: "⌫" }],
      [{ code: "Tab", w: 1.5, label: "Tab" }, ...row(top), { code: "Enter", w: 1.5, label: "↵" }],
      [{ code: "CapsLock", w: 1.75, label: "Caps" }, ...row(home), { code: "Backslash", w: 1 }, { code: "EnterLow", w: 1.25, label: "" }],
      [{ code: "ShiftLeft", w: 1.25, label: "⇧" }, { code: "IntlBackslash", w: 1 }, ...row(bottom), { code: "ShiftRight", w: 2.75, label: "⇧" }],
      spaceRow,
    ];
  }
  return [
    [...row(digits), { code: "Backspace", w: 2, label: "⌫" }],
    [{ code: "Tab", w: 1.5, label: "Tab" }, ...row(top), { code: "Backslash", w: 1.5 }],
    [{ code: "CapsLock", w: 1.75, label: "Caps" }, ...row(home), { code: "Enter", w: 2.25, label: "↵" }],
    [{ code: "ShiftLeft", w: 2.25, label: "⇧" }, ...row(bottom), { code: "ShiftRight", w: 2.75, label: "⇧" }],
    spaceRow,
  ];
}
