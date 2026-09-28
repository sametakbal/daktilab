import { createSignal, For, Show } from "solid-js";

interface LineChartProps {
  title: string;
  values: number[];
  /** Formats a value for the axis and tooltip. */
  format: (v: number) => string;
  min?: number;
  max?: number;
}

const W = 600;
const H = 180;
const PAD = { l: 36, r: 12, t: 12, b: 20 };

/** Single-series line chart with a hover crosshair and tooltip. */
export default function LineChart(props: LineChartProps) {
  const [hover, setHover] = createSignal<number | null>(null);

  const lo = () => props.min ?? Math.min(...props.values);
  const hi = () => {
    const h = props.max ?? Math.max(...props.values);
    return h === lo() ? lo() + 1 : h;
  };
  const x = (i: number) => PAD.l + (props.values.length <= 1 ? 0 : (i / (props.values.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - lo()) / (hi() - lo())) * (H - PAD.t - PAD.b);
  const path = () => props.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const ticks = () => [lo(), (lo() + hi()) / 2, hi()];

  const onMove = (e: PointerEvent) => {
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const n = props.values.length;
    if (n === 0) return;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <figure>
      <figcaption class="mb-2 text-sm font-semibold">{props.title}</figcaption>
      <div class="relative">
        <svg viewBox={`0 0 ${W} ${H}`} class="w-full touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={props.title}>
          <For each={ticks()}>
            {(v) => (
              <>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} class="stroke-slate-200 dark:stroke-slate-800" stroke-width="1" />
                <text x={PAD.l - 6} y={y(v) + 4} text-anchor="end" class="fill-slate-400 text-[11px]">
                  {props.format(v)}
                </text>
              </>
            )}
          </For>
          <path d={path()} fill="none" class="stroke-indigo-500 dark:stroke-indigo-400" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
          <Show when={hover() !== null}>
            <line x1={x(hover()!)} x2={x(hover()!)} y1={PAD.t} y2={H - PAD.b} class="stroke-slate-300 dark:stroke-slate-600" stroke-width="1" />
            <circle cx={x(hover()!)} cy={y(props.values[hover()!])} r="4.5" class="fill-indigo-500 stroke-white dark:fill-indigo-400 dark:stroke-slate-900" stroke-width="2" />
          </Show>
        </svg>
        <Show when={hover() !== null}>
          <div
            class="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow dark:bg-white dark:text-slate-900"
            style={{ left: `${(x(hover()!) / W) * 100}%` }}
          >
            #{hover()! + 1} · {props.format(props.values[hover()!])}
          </div>
        </Show>
      </div>
    </figure>
  );
}
