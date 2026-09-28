import { A, useNavigate, useParams } from "@solidjs/router";
import { createMemo, createSignal, Match, onCleanup, onMount, Show, Switch, untrack } from "solid-js";
import { allLessons, buildExercises, findLesson, type Lesson } from "../curriculum/generator";
import { t } from "../i18n";
import { LAYOUTS } from "../layouts";
import { lessonTitle } from "../lib/format";
import ResultCard from "../components/ResultCard";
import Runner, { type RunResult } from "../components/Runner";
import { Button, LinkButton } from "../components/ui";
import { isUnlocked, layoutProgress, PASS_ACCURACY, recordResult, weaknessMap } from "../store/progress";
import { settings } from "../store/settings";

interface Outcome extends RunResult {
  stars: number;
  newBest: boolean;
  unlocked: boolean;
}

export default function LessonPage() {
  const params = useParams();
  const layout = () => LAYOUTS[settings.layout];
  const lesson = createMemo(() => findLesson(layout(), params.id ?? ""));

  return (
    <Show when={lesson()} keyed fallback={<NotFound />}>
      {(l) => (
        <Show when={isUnlocked(settings.layout, l, settings.unlockAll)} fallback={<Locked />}>
          <LessonRun lesson={l} />
        </Show>
      )}
    </Show>
  );
}

function NotFound() {
  return (
    <div class="py-20 text-center">
      <p class="mb-4 text-slate-500">{t("lesson.notFound")}</p>
      <LinkButton href="/lessons">{t("result.back")}</LinkButton>
    </div>
  );
}

function Locked() {
  return (
    <div class="py-20 text-center">
      <p class="mb-4 text-4xl">🔒</p>
      <p class="mb-6 text-slate-500">{t("lesson.locked")}</p>
      <LinkButton href="/lessons">{t("result.back")}</LinkButton>
    </div>
  );
}

function LessonRun(props: { lesson: Lesson }) {
  const navigate = useNavigate();
  const layout = LAYOUTS[settings.layout];
  const [attempt, setAttempt] = createSignal(untrack(() => layoutProgress(layout.id).lessons[props.lesson.id]?.attempts ?? 0));
  const [outcome, setOutcome] = createSignal<Outcome | null>(null);

  // Weakness is read once per attempt so saving results doesn't regenerate the text mid-run.
  const exercises = createMemo(() => {
    const a = attempt();
    return untrack(() => buildExercises(layout, props.lesson, { attempt: a, weakness: weaknessMap(layout.id, props.lesson.allowed) }));
  });

  const nextLesson = () => allLessons(layout)[props.lesson.index + 1];

  const complete = (r: RunResult) => {
    const res = recordResult({ layout: layout.id, lesson: props.lesson, metrics: r.metrics, charStats: r.charStats, bigramMisses: r.bigramMisses });
    setOutcome({ ...r, stars: res.stars, newBest: res.newBest, unlocked: res.stars > 0 && res.previousStars === 0 && !!nextLesson() });
  };

  const retry = () => {
    setOutcome(null);
    setAttempt((a) => a + 1);
  };

  const goNext = () => {
    const n = nextLesson();
    if (n) navigate(`/lesson/${n.id}`);
  };

  return (
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <A href="/lessons" class="text-sm text-slate-500 hover:text-indigo-600 dark:text-slate-400">
            ← {t(`stages.${props.lesson.stage}.title`)} · {props.lesson.stageIndex + 1}.{props.lesson.number}
          </A>
          <h1 class="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{lessonTitle(layout, props.lesson)}</h1>
        </div>
        <p class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {t("lesson.target", { wpm: props.lesson.targetWpm, acc: PASS_ACCURACY })}
        </p>
      </div>

      <Switch>
        <Match when={outcome()}>
          {(o) => (
            <ResultView
              outcome={o()}
              hasNext={!!nextLesson()}
              onNext={goNext}
              onRetry={retry}
              lesson={props.lesson}
            />
          )}
        </Match>
        <Match when={!outcome()}>
          <Show when={exercises()} keyed>
            {(ex) => <Runner layout={layout} exercises={ex} visibility={props.lesson.visibility} onComplete={complete} />}
          </Show>
        </Match>
      </Switch>
    </div>
  );
}

function ResultView(props: { outcome: Outcome; lesson: Lesson; hasNext: boolean; onNext: () => void; onRetry: () => void }) {
  const layout = LAYOUTS[settings.layout];
  const canAdvance = () => props.outcome.stars > 0 && props.hasNext;

  // Enter continues (next lesson when passed, otherwise retry) so hands can stay on the keyboard.
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (canAdvance()) props.onNext();
      else props.onRetry();
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  return (
    <ResultCard
      layout={layout}
      metrics={props.outcome.metrics}
      charStats={props.outcome.charStats}
      lesson={{ stars: props.outcome.stars, targetWpm: props.lesson.targetWpm, newBest: props.outcome.newBest, unlocked: props.outcome.unlocked }}
      actions={
        <>
          <Show when={canAdvance()}>
            <Button onClick={props.onNext}>{t("result.next")} ↵</Button>
          </Show>
          <Button variant={canAdvance() ? "secondary" : "primary"} onClick={props.onRetry}>
            {t("result.retry")} {canAdvance() ? "" : "↵"}
          </Button>
          <LinkButton href="/lessons" variant="ghost">
            {t("result.back")}
          </LinkButton>
        </>
      }
    />
  );
}
