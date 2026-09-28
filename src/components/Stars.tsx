import { For } from "solid-js";

export default function Stars(props: { count: number; size?: "sm" | "lg"; animate?: boolean }) {
  const cls = () => (props.size === "lg" ? "h-10 w-10" : "h-4 w-4");
  return (
    <div class="flex items-center gap-0.5" aria-label={`${props.count}/3`}>
      <For each={[0, 1, 2]}>
        {(i) => (
          <svg
            viewBox="0 0 24 24"
            class={`${cls()} ${i < props.count ? "fill-amber-400" : "fill-slate-200 dark:fill-slate-700"} ${props.animate && i < props.count ? "pop" : ""}`}
            style={props.animate ? { "animation-delay": `${i * 150}ms` } : undefined}
          >
            <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
          </svg>
        )}
      </For>
    </div>
  );
}
