import { createEffect, For } from "solid-js";
import type { Session } from "../engine/session";

/** The exercise text with typed, mistyped, current and upcoming characters. */
export default function TypingArea(props: { session: Session; shake?: boolean; /** Show only this many lines, scrolling with the caret. */ lines?: number }) {
  let box: HTMLDivElement | undefined;

  // Keep the caret on the second visible line so upcoming text stays in view.
  createEffect(() => {
    const pos = props.session.pos;
    if (!props.lines || !box) return;
    const caret = box.children[pos] as HTMLElement | undefined;
    const lineHeight = Number.parseFloat(getComputedStyle(box).lineHeight) || 0;
    // The box is position:relative, so offsetTop is already measured from its top edge.
    box.scrollTop = caret ? Math.max(0, caret.offsetTop - lineHeight) : 0;
  });

  return (
    <div
      ref={box}
      style={props.lines ? { height: `${props.lines * 1.9}em`, overflow: "hidden", position: "relative" } : undefined}
      classList={{
        "font-mono text-2xl leading-[1.9] tracking-wide sm:text-3xl": true,
        "whitespace-pre-wrap break-normal": true,
        shake: !!props.shake,
      }}
      aria-live="off"
    >
      <For each={props.session.chars}>
        {(ch, i) => {
          const state = () => {
            const s = props.session;
            const idx = i();
            if (idx < s.pos) {
              if (s.typed[idx] !== ch) return "wrong";
              return s.errorAt.has(idx) ? "fixed" : "done";
            }
            if (idx === s.pos) return s.lastWrong !== null ? "current-error" : "current";
            return "todo";
          };
          return (
            <span
              classList={{
                "rounded-sm transition-colors": true,
                "text-slate-400 dark:text-slate-500": state() === "done",
                "text-amber-600 dark:text-amber-400": state() === "fixed",
                "bg-rose-500/15 text-rose-600 dark:text-rose-400": state() === "wrong",
                "caret text-slate-900 dark:text-white": state() === "current",
                "caret bg-rose-500/20 text-rose-600 dark:text-rose-300": state() === "current-error",
                "text-slate-700 dark:text-slate-300": state() === "todo",
              }}
            >
              {ch === " " && (state() === "wrong" || state() === "current-error") ? "␣" : ch}
            </span>
          );
        }}
      </For>
    </div>
  );
}
