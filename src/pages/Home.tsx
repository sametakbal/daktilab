import { createMemo, For, Show } from "solid-js";
import { allLessons } from "../curriculum/generator";
import { dict, t } from "../i18n";
import { LAYOUTS } from "../layouts";
import { lessonTitle, pct, round } from "../lib/format";
import { Card, LinkButton, StatTile } from "../components/ui";
import Keyboard from "../components/Keyboard";
import { layoutProgress, nextLesson, progress, streakDays } from "../store/progress";
import { settings } from "../store/settings";

export default function Home() {
  const layout = () => LAYOUTS[settings.layout];
  const next = createMemo(() => nextLesson(settings.layout));
  const lessons = createMemo(() => allLessons(layout()));
  const done = () => lessons().filter((l) => (layoutProgress(settings.layout).lessons[l.id]?.stars ?? 0) > 0).length;
  const history = () => progress.history.filter((h) => h.layout === settings.layout);
  const best = () => Math.max(0, ...history().filter((h) => h.acc >= 90).map((h) => h.wpm));
  const avgAcc = () => {
    const last = history().slice(-10);
    return last.length ? last.reduce((a, h) => a + h.acc, 0) / last.length : 0;
  };
  const started = () => history().length > 0;

  return (
    <div class="flex flex-col gap-10">
      <section class="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p class="mb-3 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
            {t(`layouts.${settings.layout}`)}
          </p>
          <h1 class="text-4xl font-extrabold tracking-tight sm:text-5xl">{t("home.hero")}</h1>
          <p class="mt-4 max-w-xl text-lg text-slate-600 dark:text-slate-400">{t("home.sub")}</p>
          <div class="mt-7 flex flex-wrap gap-3">
            <LinkButton href={`/lesson/${next().id}`} class="!px-6 !py-3 !text-base">
              {started() ? t("home.continue") : t("home.start")} · {lessonTitle(layout(), next())}
            </LinkButton>
            <Show when={started()}>
              <LinkButton href="/practice?mode=daily" variant="secondary" class="!px-6 !py-3 !text-base">
                {t("home.daily")}
              </LinkButton>
            </Show>
          </div>
          <Show when={!settings.onboarded}>
            <a href="#/onboarding" class="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              {t("home.onboarding")} →
            </a>
          </Show>
        </div>
        <Keyboard layout={layout()} highlight={new Set(["KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL", "Semicolon"])} class="hidden sm:block" />
      </section>

      <Show when={started()}>
        <section class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile value={String(streakDays(progress.history))} label={t("home.streak")} />
          <StatTile value={String(round(best()))} label={t("home.bestWpm")} />
          <StatTile value={`${done()}/${lessons().length}`} label={t("home.lessonsDone")} />
          <StatTile value={pct(avgAcc())} label={t("home.avgAcc")} />
        </section>
      </Show>

      <section>
        <h2 class="mb-4 text-lg font-bold">{t("home.tipsTitle")}</h2>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <For each={dict().home.tips}>
            {(tip, i) => (
              <Card>
                <div class="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white">{i() + 1}</div>
                <p class="text-sm text-slate-700 dark:text-slate-300">{tip}</p>
              </Card>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}
