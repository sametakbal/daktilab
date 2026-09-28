import { A } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import { curriculum } from "../curriculum/generator";
import { t } from "../i18n";
import { LAYOUT_IDS, LAYOUTS } from "../layouts";
import { lessonTitle, pct, round } from "../lib/format";
import Stars from "../components/Stars";
import { Segmented } from "../components/ui";
import { isUnlocked, layoutProgress, nextLesson } from "../store/progress";
import { setSettings, settings } from "../store/settings";

export default function Lessons() {
  const layout = () => LAYOUTS[settings.layout];
  const stages = createMemo(() => curriculum(layout()));
  const records = () => layoutProgress(settings.layout).lessons;
  const next = () => nextLesson(settings.layout);
  const total = () => stages().reduce((a, s) => a + s.lessons.length, 0);
  const done = () => stages().reduce((a, s) => a + s.lessons.filter((l) => (records()[l.id]?.stars ?? 0) > 0).length, 0);

  return (
    <div class="flex flex-col gap-8">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-3xl font-extrabold tracking-tight">{t("lessons.title")}</h1>
          <p class="mt-1 text-slate-500 dark:text-slate-400">{t("lessons.progress", { done: done(), total: total() })}</p>
        </div>
        <Segmented value={settings.layout} options={LAYOUT_IDS.map((id) => ({ value: id, label: t(`layouts.${id}`) }))} onChange={(v) => setSettings("layout", v)} />
      </div>

      <For each={stages()}>
        {(stage) => {
          const stageDone = () => stage.lessons.filter((l) => (records()[l.id]?.stars ?? 0) > 0).length;
          return (
            <section>
              <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 class="text-lg font-bold">
                    <span class="mr-2 text-slate-400">{stage.index + 1}.</span>
                    {t(`stages.${stage.key}.title`)}
                  </h2>
                  <p class="text-sm text-slate-500 dark:text-slate-400">{t(`stages.${stage.key}.desc`)}</p>
                </div>
                <div class="flex items-center gap-2 text-xs text-slate-500">
                  <div class="h-1.5 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div class="h-full bg-emerald-500" style={{ width: `${(stageDone() / stage.lessons.length) * 100}%` }} />
                  </div>
                  {stageDone()}/{stage.lessons.length}
                </div>
              </div>
              <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <For each={stage.lessons}>
                  {(lesson) => {
                    const rec = () => records()[lesson.id];
                    const open = () => isUnlocked(settings.layout, lesson, settings.unlockAll);
                    const body = () => (
                      <>
                        <div class="flex items-start justify-between gap-2">
                          <span class="text-xs font-semibold text-slate-400">
                            {stage.index + 1}.{lesson.number}
                          </span>
                          <Show when={open()} fallback={<span aria-label="locked">🔒</span>}>
                            <Stars count={rec()?.stars ?? 0} />
                          </Show>
                        </div>
                        <div class="mt-2 font-semibold leading-snug">{lessonTitle(layout(), lesson)}</div>
                        <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          <Show when={rec()} fallback={t("lesson.target", { wpm: lesson.targetWpm, acc: 94 })}>
                            {(r) => `${round(r().bestWpm)} ${t("metrics.wpm")} · ${pct(r().bestAcc)}`}
                          </Show>
                        </div>
                      </>
                    );
                    return (
                      <Show
                        when={open()}
                        fallback={
                          <div title={t("lesson.locked")} class="rounded-xl border border-dashed border-slate-200 p-4 opacity-60 dark:border-slate-800">
                            {body()}
                          </div>
                        }
                      >
                        <A
                          href={`/lesson/${lesson.id}`}
                          classList={{
                            "rounded-xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md": true,
                            "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/5": (rec()?.stars ?? 0) > 0,
                            "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900": !rec()?.stars && next().id !== lesson.id,
                            "border-indigo-300 bg-white ring-2 ring-indigo-500/30 dark:border-indigo-500/50 dark:bg-slate-900": next().id === lesson.id && !rec()?.stars,
                          }}
                        >
                          {body()}
                        </A>
                      </Show>
                    );
                  }}
                </For>
              </div>
            </section>
          );
        }}
      </For>
    </div>
  );
}
