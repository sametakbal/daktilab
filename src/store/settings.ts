import { createRoot } from "solid-js";
import type { ErrorMode } from "../engine/session";
import { LAYOUT_IDS } from "../layouts";
import type { LayoutId } from "../layouts/types";
import { createPersistentStore } from "./persist";

export type Lang = "tr" | "en";
export type Theme = "system" | "light" | "dark";
export type KeyboardMode = "auto" | "full" | "faded" | "hidden";

export interface Settings {
  layout: LayoutId;
  lang: Lang;
  theme: Theme;
  errorMode: ErrorMode;
  keyboard: KeyboardMode;
  showHands: boolean;
  sound: boolean;
  metronome: boolean;
  bpm: number;
  unlockAll: boolean;
  onboarded: boolean;
}

function browserLang(): Lang {
  try {
    return navigator.language.toLowerCase().startsWith("tr") ? "tr" : "en";
  } catch {
    return "tr";
  }
}

const defaults = (): Settings => {
  const lang = browserLang();
  return {
    layout: lang === "tr" ? "tr-q" : "en-us",
    lang,
    theme: "system",
    errorMode: "stop",
    keyboard: "auto",
    showHands: true,
    sound: false,
    metronome: false,
    bpm: 120,
    unlockAll: false,
    onboarded: false,
  };
};

function sanitize(stored: unknown, d: Settings): Settings {
  const s = { ...d, ...(stored as Partial<Settings>) };
  if (!LAYOUT_IDS.includes(s.layout)) s.layout = d.layout;
  if (s.lang !== "tr" && s.lang !== "en") s.lang = d.lang;
  if (!["system", "light", "dark"].includes(s.theme)) s.theme = d.theme;
  if (s.errorMode !== "stop" && s.errorMode !== "continue") s.errorMode = d.errorMode;
  if (!["auto", "full", "faded", "hidden"].includes(s.keyboard)) s.keyboard = d.keyboard;
  s.bpm = Math.min(300, Math.max(30, Number(s.bpm) || d.bpm));
  return s;
}

export const [settings, setSettings] = createRoot(() => createPersistentStore<Settings>("settings", defaults(), sanitize));
