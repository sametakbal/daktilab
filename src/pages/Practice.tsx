import { useSearchParams } from "@solidjs/router";
import { createMemo, createSignal, For, Match, Show, Switch, untrack } from "solid-js";
import { buildPractice, type Exercise } from "../curriculum/generator";
import { t } from "../i18n";
import { LAYOUTS, lower, strokeFor } from "../layouts";
import { keyName } from "../lib/format";
import Keyboard from "../components/Keyboard";
import ResultCard from "../components/ResultCard";
import Runner, { type RunResult } from "../components/Runner";
import { Button, Card } from "../components/ui";
import { keyInsights, learnedChars, recordResult } from "../store/progress";
import { settings } from "../store/settings";

type Mode = "weak" | "daily" | "custom";

export default function Practice() {
  const [params, setParams] = useSearchParams();
  const mode = (): Mode => (["weak", "daily", "custom"].includes(params.mode as string) ? (params.mode as Mode) : "weak");
  const layout = () => LAYOUTS[settings.layout];
  const learned = createMemo(() => learnedChars(settings.layout));
  const insights = createMemo(() => keyInsights(settings.layout, learned()));
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [run, setRun] = createSignal<Exercise[] | null>(null);
  const [result, setResult] = createSignal<RunResult | null>(null);

  const weights = (): Record<string, number> =>
    Object.fromEntries(
      insights().map((k) => {
        const slow = Math.max(0, k.weakness - Math.min(1, k.daysSince / 7) * 0.3);
        return [k.ch, mode() === "daily" ? k.weakness : slow];
      }),
    );

  const ranked = () =>
    Object.entries(weights())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

  // Keys the learner may pick: physical codes whose base character is already learned.
  const learnedCodes = createMemo(() => {
    const codes = new Set<string>();
    for (const ch of learned()) {
      const s = strokeFor(layout(), lower(layout(), ch));
      if (s && s.code !== "Space") codes.add(s.code);
    }
    return codes;
  });

  const toggle = (code: string) => {
    const next = new Set(selected());
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setSelected(next);
  };

  const start = () => {
    const focus =
      mode() === "custom"
        ? [...selected()].map((code) => layout().keys[code]?.base).filter((ch): ch is string => !!ch && learned().includes(ch))
        : [];
    const w = untrack(weights);
    setResult(null);
    setRun(buildPractice(layout(), learned(), w, Date.now() & 0xffffff, focus));
  };

  const complete = (r: RunResult) => {
    recordResult({ layout: settings.layout, lesson: null, metrics: r.metrics, charStats: r.charStats, bigramMisses: r.bigramMisses });
    setRun(null);
    setResult(r);
  };

  const modes = [
    { id: "weak", title: "practice.weak", desc: "practice.weakDesc" },
    { id: "daily", title: "practice.daily", desc: "practice.dailyDesc" },
    { id: "custom", title: "practice.custom", desc: "practice.customDesc" },
  ] as const;

  return (
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-3xl font-extrabold tracking-tight">{t("practice.title")}</h1>
        <p class="mt-1 text-slate-500 dark:text-slate-400">{t("practice.sub")}</p>
      </div>

      <Switch>
        <Match when={run()} keyed>
          {(ex) => <Runner layout={layout()} exercises={ex} visibility="faded" onComplete={complete} />}
        </Match>
        <Match when={result()}>
          {(r) => (
            <ResultCard
              layout={layout()}
              metrics={r().metrics}
              charStats={r().charStats}
              actions={
                <>
                  <Button onClick={start}>{t("result.practiceAgain")}</Button>
                  <Button variant="ghost" onClick={() => setResult(null)}>
                    {t("common.close")}
                  </Button>
                </>
              }
            />
          )}
        </Match>
        <Match when={true}>
          <div class="grid gap-3 sm:grid-cols-3">
            <For each={modes}>
              {(m) => (
                <button
                  type="button"
                  onClick={() => setParams({ mode: m.id })}
                  classList={{
                    "rounded-2xl border p-5 text-left transition": true,
                    "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-500/30 dark:border-indigo-500/60 dark:bg-indigo-500/10": mode() === m.id,
                    "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900": mode() !== m.id,
                  }}
                >
                  <div class="font-semibold">{t(m.title)}</div>
                  <div class="mt-1 text-sm text-slate-500 dark:text-slate-400">{t(m.desc)}</div>
                </button>
              )}
            </For>
          </div>

          <Show
            when={mode() === "custom"}
            fallback={
              <Card>
                <Show when={ranked().length > 0} fallback={<p class="text-sm text-slate-500">{t("practice.noData")}</p>}>
                  <div class="grid gap-2 sm:grid-cols-2">
                    <For each={ranked()}>
                      {([ch, w]) => (
                        <div class="flex items-center gap-3">
                          <span class="w-8 rounded-md bg-slate-100 py-1 text-center font-mono font-semibold dark:bg-slate-800">{keyName(layout(), ch)}</span>
                          <div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div class="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500" style={{ width: `${Math.max(4, w * 100)}%` }} />
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </Card>
            }
          >
            <div>
              <p class="mb-2 text-sm text-slate-500 dark:text-slate-400">{t("practice.pickKeys")}</p>
              <Keyboard layout={layout()} clickable={learnedCodes()} selected={selected()} onKeyClick={toggle} />
            </div>
          </Show>

          <div class="flex items-center gap-3">
            <Button class="!px-8 !py-3 !text-base" onClick={start} disabled={mode() === "custom" && selected().size === 0}>
              {t("practice.start")}
            </Button>
            <span class="text-sm text-slate-500">
              {t("practice.learned")}: <span class="font-mono">{learned().filter((c) => c !== " " && lower(layout(), c) === c).map((c) => keyName(layout(), c)).slice(0, 40).join(" ")}</span>
            </span>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
