import { For, type JSX, Show } from "solid-js";
import type { CharStat } from "../engine/session";
import type { Metrics } from "../engine/metrics";
import { t } from "../i18n";
import type { Layout } from "../layouts/types";
import { formatDuration, keyName, pct, round } from "../lib/format";
import { PASS_ACCURACY } from "../store/progress";
import Stars from "./Stars";

interface ResultCardProps {
  layout: Layout;
  metrics: Metrics;
  charStats: Record<string, CharStat>;
  /** Lesson results show pass/fail and stars; practice results don't. */
  lesson?: { stars: number; targetWpm: number; newBest: boolean; unlocked: boolean };
  actions: JSX.Element;
  /** Label for the speed figure when it isn't plain WPM (e.g. correct words in a timed test). */
  scoreLabel?: string;
}

export default function ResultCard(props: ResultCardProps) {
  const passed = () => !props.lesson || props.lesson.stars > 0;
  const weakest = () =>
    Object.entries(props.charStats)
      .filter(([ch, s]) => ch !== " " && s.misses > 0)
      .sort((a, b) => b[1].misses - a[1].misses)
      .slice(0, 5);

  const stat = (label: string, value: string) => (
    <div class="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
      <div class="font-mono text-2xl font-semibold tabular-nums">{value}</div>
      <div class="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );

  return (
    <div class="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-10">
      <Show when={props.lesson}>
        {(l) => (
          <div class="mb-3 flex justify-center">
            <Stars count={l().stars} size="lg" animate />
          </div>
        )}
      </Show>
      <h2 class="text-2xl font-bold">{passed() ? t("result.passed") : t("result.failed")}</h2>
      <div class="mt-2 flex flex-wrap justify-center gap-2 text-sm">
        <Show when={props.lesson?.newBest}>
          <span class="rounded-full bg-amber-100 px-3 py-0.5 font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">🏆 {t("result.newBest")}</span>
        </Show>
        <Show when={props.lesson?.unlocked}>
          <span class="rounded-full bg-emerald-100 px-3 py-0.5 font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">🔓 {t("result.unlocked")}</span>
        </Show>
      </div>
      <Show when={props.lesson && !passed()}>
        <p class="mx-auto mt-3 max-w-md text-sm text-slate-600 dark:text-slate-400">
          {t("result.failedHint", { acc: PASS_ACCURACY, wpm: props.lesson!.targetWpm })}
        </p>
      </Show>

      <div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat(props.scoreLabel ?? t("metrics.wpm"), String(round(props.metrics.wpm)))}
        {stat(t("metrics.accuracy"), pct(props.metrics.accuracy))}
        {stat(t("metrics.time"), formatDuration(props.metrics.durationMs))}
        {stat(t("metrics.errors"), String(props.metrics.errors))}
      </div>

      <Show when={weakest().length > 0}>
        <div class="mt-6">
          <div class="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">{t("result.weakest")}</div>
          <div class="flex flex-wrap justify-center gap-2">
            <For each={weakest()}>
              {([ch, s]) => (
                <span class="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-mono text-sm dark:border-rose-500/30 dark:bg-rose-500/10">
                  <span class="font-semibold">{keyName(props.layout, ch)}</span>
                  <span class="text-rose-600 dark:text-rose-300">×{s.misses}</span>
                </span>
              )}
            </For>
          </div>
        </div>
      </Show>

      <div class="mt-8 flex flex-wrap justify-center gap-3">{props.actions}</div>
    </div>
  );
}
