import { For } from "solid-js";
import type { Finger } from "../layouts/types";

interface Shape {
  x: number;
  y: number;
  h: number;
  rotate?: number;
}

// Left hand, pinky → index, then thumb. The right hand is mirrored.
const SHAPES: Shape[] = [
  { x: 14, y: 44, h: 62 },
  { x: 42, y: 20, h: 84 },
  { x: 70, y: 8, h: 96 },
  { x: 98, y: 22, h: 82 },
  { x: 132, y: 82, h: 52, rotate: -38 },
];

const LEFT: Finger[] = ["lp", "lr", "lm", "li", "th"];
const RIGHT: Finger[] = ["rp", "rr", "rm", "ri", "th"];

export default function Hands(props: { active: Set<Finger>; class?: string }) {
  const hand = (fingers: Finger[], mirror: boolean) => (
    <g transform={mirror ? "translate(330 0) scale(-1 1)" : undefined}>
      <rect x="12" y="92" width="116" height="54" rx="24" class="fill-slate-200 dark:fill-slate-800" />
      <For each={SHAPES}>
        {(s, i) => {
          const f = fingers[i()];
          const on = () => props.active.has(f);
          return (
            <g transform={s.rotate ? `rotate(${s.rotate} ${s.x + 11} ${s.y + s.h})` : undefined}>
              <rect
                x={s.x}
                y={s.y}
                width="26"
                height={s.h}
                rx="13"
                style={{ fill: on() ? `var(--f-${f})` : undefined, transition: "fill 120ms" }}
                class={on() ? "" : "fill-slate-200 dark:fill-slate-800"}
              />
              <circle cx={s.x + 13} cy={s.y + 13} r="5" style={{ fill: `var(--f-${f})`, opacity: on() ? 0 : 0.8 }} />
            </g>
          );
        }}
      </For>
    </g>
  );

  return (
    <svg viewBox="0 0 330 150" class={props.class} role="img" aria-hidden="true">
      {hand(LEFT, false)}
      {hand(RIGHT, true)}
    </svg>
  );
}
