import { useNavigate } from "@solidjs/router";
import { createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { allLessons } from "../curriculum/generator";
import { dict, t } from "../i18n";
import { capLabel, LAYOUTS } from "../layouts";
import { FINGER_OF, HOME_KEYS } from "../layouts/physical";
import type { Finger } from "../layouts/types";
import Hands from "../components/Hands";
import Keyboard from "../components/Keyboard";
import { Button, Card } from "../components/ui";
import { setSettings, settings } from "../store/settings";

const STEPS = ["posture", "home", "try", "rules"] as const;
const HOME_ORDER: Finger[] = ["lp", "lr", "lm", "li", "ri", "rm", "rr", "rp"];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = createSignal(0);
  const layout = () => LAYOUTS[settings.layout];
  const homeCodes = HOME_ORDER.map((f) => HOME_KEYS[f]!);
  const homeLabels = () => homeCodes.map((c) => capLabel(layout(), c)).join(" ");

  const finish = () => {
    setSettings("onboarded", true);
    navigate(`/lesson/${allLessons(layout())[0].id}`);
  };

  return (
    <div class="mx-auto flex max-w-4xl flex-col gap-6">
      <div class="flex items-center justify-between">
        <h1 class="text-3xl font-extrabold tracking-tight">{t("onboarding.title")}</h1>
        <button class="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={finish}>
          {t("onboarding.skip")}
        </button>
      </div>

      <div class="flex gap-2">
        <For each={STEPS}>{(_, i) => <div classList={{ "h-1.5 flex-1 rounded-full": true, "bg-indigo-500": i() <= step(), "bg-slate-200 dark:bg-slate-800": i() > step() }} />}</For>
      </div>

      <Card class="!p-6 sm:!p-8">
        <Switch>
          <Match when={STEPS[step()] === "posture"}>
            <h2 class="mb-4 text-xl font-bold">{t("onboarding.steps.posture.title")}</h2>
            <ul class="space-y-3">
              <For each={dict().onboarding.steps.posture.items}>
                {(item) => (
                  <li class="flex gap-3">
                    <span class="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                    <span>{item}</span>
                  </li>
                )}
              </For>
            </ul>
          </Match>
          <Match when={STEPS[step()] === "home"}>
            <h2 class="mb-3 text-xl font-bold">{t("onboarding.steps.home.title")}</h2>
            <p class="mb-2 text-slate-700 dark:text-slate-300">{t("onboarding.steps.home.body")}</p>
            <p class="mb-5 text-sm text-slate-500">
              {t("onboarding.steps.home.layoutNote", { layout: t(`layouts.${settings.layout}`), keys: homeLabels() })}
            </p>
            <Keyboard layout={layout()} highlight={new Set([...homeCodes, "Space"])} />
            <Hands active={new Set<Finger>([...HOME_ORDER, "th"])} class="mx-auto mt-4 w-64" />
          </Match>
          <Match when={STEPS[step()] === "try"}>
            <TryHomeRow codes={homeCodes} />
          </Match>
          <Match when={STEPS[step()] === "rules"}>
            <h2 class="mb-4 text-xl font-bold">{t("onboarding.steps.rules.title")}</h2>
            <ol class="space-y-3">
              <For each={dict().onboarding.steps.rules.items}>
                {(item, i) => (
                  <li class="flex gap-3">
                    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{i() + 1}</span>
                    <span>{item}</span>
                  </li>
                )}
              </For>
            </ol>
          </Match>
        </Switch>
      </Card>

      <div class="flex justify-between">
        <Button variant="ghost" disabled={step() === 0} onClick={() => setStep((s) => s - 1)}>
          ← {t("onboarding.back")}
        </Button>
        <Show when={step() < STEPS.length - 1} fallback={<Button onClick={finish}>{t("onboarding.finish")} →</Button>}>
          <Button onClick={() => setStep((s) => s + 1)}>{t("onboarding.next")} →</Button>
        </Show>
      </div>
    </div>
  );
}

/** Press each home-row key in order, left pinky to right pinky. */
function TryHomeRow(props: { codes: string[] }) {
  const layout = () => LAYOUTS[settings.layout];
  const [index, setIndex] = createSignal(0);
  const [wrong, setWrong] = createSignal<string | null>(null);
  const sequence = () => [...props.codes, ...props.codes];
  const current = () => sequence()[index()];
  const finished = () => index() >= sequence().length;

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished() || e.metaKey || e.ctrlKey || Array.from(e.key).length !== 1) return;
      e.preventDefault();
      const expected = layout().keys[current()]?.base;
      if (e.key === expected) {
        setWrong(null);
        setIndex((i) => i + 1);
      } else {
        setWrong(e.code);
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  return (
    <div>
      <h2 class="mb-2 text-xl font-bold">{t("onboarding.steps.try.title")}</h2>
      <p class="mb-5 text-slate-700 dark:text-slate-300">
        <Show when={!finished()} fallback={<span class="font-semibold text-emerald-600 dark:text-emerald-400">✓ {t("onboarding.steps.try.done")}</span>}>
          {t("onboarding.steps.try.body")}{" "}
          <span class="font-semibold">{t("lesson.press", { finger: t(`fingers.${FINGER_OF[current()]}`), key: capLabel(layout(), current()) })}</span>
        </Show>
      </p>
      <div class="mb-4 flex flex-wrap justify-center gap-2 font-mono text-xl">
        <For each={sequence()}>
          {(code, i) => (
            <span
              classList={{
                "flex h-10 w-10 items-center justify-center rounded-lg border": true,
                "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300": i() < index(),
                "border-indigo-400 ring-2 ring-indigo-500/40": i() === index(),
                "border-slate-200 text-slate-400 dark:border-slate-700": i() > index(),
              }}
            >
              {capLabel(layout(), code)}
            </span>
          )}
        </For>
      </div>
      <Keyboard layout={layout()} highlight={finished() ? new Set() : new Set([current()])} wrong={wrong()} />
      <Hands active={finished() ? new Set() : new Set([FINGER_OF[current()]])} class="mx-auto mt-4 w-64" />
    </div>
  );
}
