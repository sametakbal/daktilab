import { For, Show } from "solid-js";
import { capLabel, isLetter } from "../layouts";
import { FINGER_OF, physicalRows } from "../layouts/physical";
import type { Layout } from "../layouts/types";

export interface KeyboardProps {
  layout: Layout;
  /** Codes to emphasise (the next key and any modifier). */
  highlight?: Set<string>;
  /** Dim key labels so the learner relies on memory. */
  faded?: boolean;
  /** Code that was just mistyped (flashes red). */
  wrong?: string | null;
  /** Code that was just pressed correctly. */
  pressed?: string | null;
  /** 0..1 per code: colours keys from green to red instead of finger colours. */
  heat?: Record<string, number>;
  /** Tooltip per code. */
  titles?: Record<string, string>;
  selected?: Set<string>;
  /** Codes that can be clicked (others are disabled) when onKeyClick is set. */
  clickable?: Set<string>;
  onKeyClick?: (code: string) => void;
  class?: string;
}

/** Sequential single-hue scale: light (few errors) → deep rose (many). */
const heatColor = (v: number) => `color-mix(in oklab, #e11d48 ${Math.round(12 + 88 * Math.min(1, v))}%, #f1f5f9)`;

export default function Keyboard(props: KeyboardProps) {
  const rows = () => physicalRows(props.layout.iso);

  return (
    <div class={`select-none rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-3 ${props.class ?? ""}`}>
      <div class="flex flex-col gap-1 sm:gap-1.5">
        <For each={rows()}>
          {(row) => (
            <div class="flex gap-1 sm:gap-1.5">
              <For each={row}>
                {(k) => {
                  const chars = () => props.layout.keys[k.code];
                  const finger = FINGER_OF[k.code];
                  const label = () => k.label ?? capLabel(props.layout, k.code);
                  const sub = () => {
                    const c = chars();
                    if (!c?.shift || isLetter(c.base)) return "";
                    return c.shift;
                  };
                  const lit = () => props.highlight?.has(k.code) ?? false;
                  const heat = () => props.heat?.[k.code];
                  const isSelected = () => props.selected?.has(k.code) ?? false;
                  const canClick = () => !!props.onKeyClick && (props.clickable?.has(k.code) ?? true);
                  const style = () => {
                    const h = heat();
                    const fc = h !== undefined ? heatColor(h) : finger ? `var(--f-${finger})` : "transparent";
                    return { flex: `${k.w} ${k.w} 0%`, "--fc": fc, ...(lit() || h !== undefined ? { background: "var(--fc)" } : {}) };
                  };
                  return (
                    <button
                      type="button"
                      tabIndex={canClick() ? 0 : -1}
                      disabled={!canClick()}
                      onClick={() => canClick() && props.onKeyClick?.(k.code)}
                      title={props.titles?.[k.code]}
                      style={style()}
                      classList={{
                        "relative flex h-9 min-w-0 items-center justify-center rounded-md border text-xs font-medium transition-all duration-100 sm:h-12 sm:rounded-lg sm:text-sm": true,
                        "border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200": !lit(),
                        "key-soft": !!finger && heat() === undefined && !lit(),
                        "!text-white": (heat() ?? 0) > 0.5,
                        "!text-slate-800": heat() !== undefined && (heat() ?? 0) <= 0.5,
                        "bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500": !finger && heat() === undefined && !lit(),
                        "z-10 -translate-y-0.5 scale-105 border-transparent text-white shadow-lg": lit(),
                        "ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-900": isSelected(),
                        "!bg-rose-500 !text-white": props.wrong === k.code,
                        "!bg-emerald-500/70": props.pressed === k.code && props.wrong !== k.code,
                        "cursor-pointer hover:brightness-110": canClick(),
                        "cursor-default": !canClick(),
                      }}
                    >
                      <span classList={{ "transition-opacity": true, "opacity-15": !!props.faded && !lit() }}>{label()}</span>
                      <Show when={sub()}>
                        <span classList={{ "absolute left-1 top-0.5 hidden text-[10px] leading-none opacity-60 sm:block": true, "!opacity-10": !!props.faded && !lit() }}>{sub()}</span>
                      </Show>
                      <Show when={chars()?.altGr}>
                        <span classList={{ "absolute bottom-0.5 right-1 hidden text-[10px] leading-none opacity-50 sm:block": true, "!opacity-10": !!props.faded && !lit() }}>{chars()!.altGr}</span>
                      </Show>
                      <Show when={k.code === "KeyF" || k.code === "KeyJ"}>
                        <span class="absolute bottom-1 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full bg-current opacity-50" />
                      </Show>
                    </button>
                  );
                }}
              </For>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
