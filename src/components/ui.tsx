import { A } from "@solidjs/router";
import { For, type JSX, splitProps } from "solid-js";

const variants = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm",
  secondary: "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
  ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
};

const base = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50";

type Variant = keyof typeof variants;

export function Button(props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const [local, rest] = splitProps(props, ["variant", "class"]);
  return <button type="button" class={`${base} ${variants[local.variant ?? "primary"]} ${local.class ?? ""}`} {...rest} />;
}

export function LinkButton(props: { href: string; variant?: Variant; class?: string; children: JSX.Element }) {
  return (
    <A href={props.href} class={`${base} ${variants[props.variant ?? "primary"]} ${props.class ?? ""}`}>
      {props.children}
    </A>
  );
}

export function Card(props: { class?: string; children: JSX.Element }) {
  return <div class={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${props.class ?? ""}`}>{props.children}</div>;
}

export function Segmented<T extends string>(props: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; class?: string }) {
  return (
    <div role="radiogroup" class={`inline-flex flex-wrap rounded-xl bg-slate-100 p-1 dark:bg-slate-800 ${props.class ?? ""}`}>
      <For each={props.options}>
        {(o) => (
          <button
            type="button"
            role="radio"
            aria-checked={props.value === o.value}
            onClick={() => props.onChange(o.value)}
            classList={{
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors": true,
              "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white": props.value === o.value,
              "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white": props.value !== o.value,
            }}
          >
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label class="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span class="block text-sm font-medium">{props.label}</span>
        {props.description && <span class="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{props.description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        onClick={() => props.onChange(!props.checked)}
        classList={{
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors": true,
          "bg-indigo-600": props.checked,
          "bg-slate-300 dark:bg-slate-700": !props.checked,
        }}
      >
        <span classList={{ "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform": true, "translate-x-5": props.checked, "translate-x-0.5": !props.checked }} />
      </button>
    </label>
  );
}

export function StatTile(props: { value: string; label: string }) {
  return (
    <Card class="!p-4">
      <div class="font-mono text-2xl font-semibold tabular-nums">{props.value}</div>
      <div class="text-xs text-slate-500 dark:text-slate-400">{props.label}</div>
    </Card>
  );
}
