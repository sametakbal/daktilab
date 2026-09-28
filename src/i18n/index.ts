import * as i18n from "@solid-primitives/i18n";
import { createMemo, createRoot } from "solid-js";
import { settings } from "../store/settings";
import { en } from "./en";
import { tr, type Dict } from "./tr";

const dictionaries: Record<"tr" | "en", Dict> = { tr, en };

export const { t, dict } = createRoot(() => {
  const dict = createMemo(() => dictionaries[settings.lang]);
  const flat = createMemo(() => i18n.flatten(dict()));
  const t = i18n.translator(flat, i18n.resolveTemplate);
  return { t, dict };
});
