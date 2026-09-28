import { useNavigate } from "@solidjs/router";
import { batch, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import type { Exercise } from "../curriculum/generator";
import type { Visibility } from "../curriculum/stages";
import { combine, correctWords, type Metrics, mergeCharStats, metrics } from "../engine/metrics";
import { type CharStat, createSession, input, isFinished, type Session } from "../engine/session";
import { t } from "../i18n";
import { strokeFor } from "../layouts";
import { handOf, type Finger, type Layout, type LayoutId } from "../layouts/types";
import { playError, playTick } from "../lib/audio";
import { formatDuration, keyName, pct, round } from "../lib/format";
import { type KeySample, suggestLayout } from "../lib/layoutDetect";
import { setSettings, settings } from "../store/settings";
import Hands from "./Hands";
import Keyboard from "./Keyboard";
import TypingArea from "./TypingArea";

export interface RunResult {
  metrics: Metrics;
  charStats: Record<string, CharStat>;
  bigramMisses: Record<string, number>;
}

interface RunnerProps {
  layout: Layout;
  exercises: Exercise[];
  visibility: Visibility;
  onComplete: (r: RunResult) => void;
  /** Timed run: ends this long after the first key; score is correct words per minute. */
  timeLimitMs?: number;
  /** Limit the text to this many visible lines (for long timed passages). */
  lines?: number;
}

/** Pause before a hint appears, so the learner first tries to recall the key. */
const HINT_MS = 1500;
const STEP_PAUSE_MS = 400;

export default function Runner(props: RunnerProps) {
  const navigate = useNavigate();
  const [step, setStep] = createSignal(0);
  const [session, setSession] = createSignal<Session>(createSession(props.exercises[0].text, settings.errorMode));
  const [done, setDone] = createSignal<Metrics[]>([]);
  const [now, setNow] = createSignal(performance.now());
  const [lastActivity, setLastActivity] = createSignal(performance.now());
  const [wrongCode, setWrongCode] = createSignal<string | null>(null);
  const [pressedCode, setPressedCode] = createSignal<string | null>(null);
  const [shake, setShake] = createSignal(false);
  const [capsLock, setCapsLock] = createSignal(false);
  const [mismatch, setMismatch] = createSignal<{ mismatch: boolean; suggestion: LayoutId | null }>({ mismatch: false, suggestion: null });
  const [mismatchDismissed, setMismatchDismissed] = createSignal(false);
  // Keys only reach the page while the window has focus; blur the text otherwise so it's obvious.
  const [focused, setFocused] = createSignal(document.hasFocus());

  let charStats: Record<string, CharStat> = {};
  let bigrams: Record<string, number> = {};
  let samples: KeySample[] = [];
  let flashTimer: number | undefined;
  let stepTimer: number | undefined;
  /** Correct words from finished steps, for timed runs. */
  let wordsDone = 0;
  let ended = false;

  const exercise = () => props.exercises[step()];
  const visibility = (): Visibility => {
    if (exercise().kind === "intro") return "full";
    return settings.keyboard === "auto" ? props.visibility : settings.keyboard;
  };
  const hintActive = () => visibility() === "full" || now() - lastActivity() > HINT_MS;

  const expected = () => session().chars[session().pos];
  const stroke = createMemo(() => {
    const ch = expected();
    return ch === undefined ? undefined : strokeFor(props.layout, ch);
  });

  const highlight = createMemo(() => {
    const s = stroke();
    const codes = new Set<string>();
    if (!s || !hintActive()) return codes;
    codes.add(s.code);
    if (s.shift) codes.add(handOf(s.finger) === "left" ? "ShiftRight" : "ShiftLeft");
    if (s.altGr) codes.add("AltRight");
    return codes;
  });

  const activeFingers = createMemo(() => {
    const s = stroke();
    const set = new Set<Finger>();
    if (!s || !hintActive()) return set;
    set.add(s.finger);
    if (s.shift) set.add(handOf(s.finger) === "left" ? "rp" : "lp");
    if (s.altGr) set.add("th");
    return set;
  });

  const instruction = () => {
    const s = stroke();
    const ch = expected();
    if (!s || ch === undefined) return "";
    const params = { finger: t(`fingers.${s.finger}`), key: ch === " " ? t("keys.space") : keyName(props.layout, ch) };
    if (s.altGr) return t("lesson.pressAltGr", params);
    if (s.shift) return t("lesson.pressShift", params);
    return t("lesson.press", params);
  };

  const live = createMemo(() => combine([...done(), metrics(session(), now())]));
  // Once the current step is recorded in done(), its words are already part of wordsDone.
  const liveWords = () => wordsDone + (done().length > step() ? 0 : correctWords(session()));
  const remainingMs = () => Math.max(0, (props.timeLimitMs ?? 0) - live().durationMs);

  const flash = (code: string, wrong: boolean) => {
    clearTimeout(flashTimer);
    batch(() => {
      setWrongCode(wrong ? code : null);
      setPressedCode(wrong ? null : code);
      if (wrong) setShake(true);
    });
    flashTimer = window.setTimeout(() => {
      batch(() => {
        setWrongCode(null);
        setPressedCode(null);
        setShake(false);
      });
    }, wrong ? 220 : 120);
  };

  const startStep = (i: number) => {
    batch(() => {
      setStep(i);
      setSession(createSession(props.exercises[i].text, settings.errorMode));
      setLastActivity(performance.now());
    });
  };

  /** `at` overrides the end time (a timed run stops exactly at its limit); `timeUp` ends the whole run. */
  const finishStep = (s: Session, at = s.finishedAt ?? performance.now(), timeUp = false) => {
    const m = metrics(s, at);
    charStats = mergeCharStats(charStats, s.charStats);
    for (const [bg, n] of Object.entries(s.bigramMisses)) bigrams[bg] = (bigrams[bg] ?? 0) + n;
    wordsDone += correctWords(s);
    const all = [...done(), m];
    setDone(all);
    if (!timeUp && step() + 1 < props.exercises.length) {
      stepTimer = window.setTimeout(() => startStep(step() + 1), STEP_PAUSE_MS);
      return;
    }
    ended = true;
    const total = combine(all);
    if (props.timeLimitMs) total.wpm = total.durationMs > 0 ? wordsDone / (total.durationMs / 60000) : 0;
    stepTimer = window.setTimeout(() => props.onComplete({ metrics: total, charStats, bigramMisses: bigrams }), STEP_PAUSE_MS);
  };

  const checkTime = (at: number) => {
    const limit = props.timeLimitMs;
    const s = session();
    if (!limit || ended || s.startedAt === null || isFinished(s)) return;
    const used = done().reduce((a, m) => a + m.durationMs, 0);
    if (used + at - s.startedAt >= limit) finishStep(s, s.startedAt + limit - used, true);
  };

  const sample = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || !/\p{L}/u.test(e.key)) return;
    samples = [...samples.slice(-15), { code: e.code, key: e.key, shift: e.shiftKey }];
    setMismatch(suggestLayout(settings.layout, samples));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    if (ended) return;
    if (e.key === "Escape") {
      if (!isFinished(session())) startStep(step());
      return;
    }
    if (e.metaKey || (e.ctrlKey && !e.altKey)) return;
    if (typeof e.getModifierState === "function") setCapsLock(e.getModifierState("CapsLock"));

    let key: string;
    if (e.key === "Backspace") key = "Backspace";
    else if (Array.from(e.key).length === 1) key = e.key;
    else return; // Shift, Dead, Tab, arrows…
    e.preventDefault();
    if (key !== "Backspace") sample(e);

    const at = performance.now();
    checkTime(at);
    if (ended) return;
    const before = session();
    const next = input(before, key, at);
    if (next === before) return;
    batch(() => {
      setSession(next);
      setLastActivity(at);
      setNow(at);
    });
    if (key !== "Backspace") {
      const wrong = next.correctKeystrokes === before.correctKeystrokes;
      flash(e.code, wrong);
      if (wrong && settings.sound) playError();
    }
    if (isFinished(next)) finishStep(next);
  };

  onMount(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    window.addEventListener("keydown", onKeyDown);
    // Time spent away from the window doesn't count: on return, shift the session's clock forward.
    let blurredAt: number | null = null;
    const onBlur = () => {
      blurredAt = performance.now();
      setFocused(false);
    };
    const onFocus = () => {
      const at = performance.now();
      const s = session();
      if (blurredAt !== null && s.startedAt !== null && !isFinished(s) && !ended) {
        const away = at - blurredAt;
        setSession({ ...s, startedAt: s.startedAt + away, lastAt: s.lastAt === null ? null : s.lastAt + away });
      }
      blurredAt = null;
      batch(() => {
        setNow(at);
        setLastActivity(at);
        setFocused(true);
      });
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    const tick = window.setInterval(() => {
      if (!focused()) return; // paused: the clock stays frozen until focus returns
      const at = performance.now();
      setNow(at);
      checkTime(at);
    }, 200);
    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      clearInterval(tick);
      clearTimeout(flashTimer);
      clearTimeout(stepTimer);
    });
  });

  // Metronome runs only while the learner is actively typing.
  const typing = () => session().startedAt !== null && !isFinished(session());
  createEffect(
    on([() => settings.metronome && typing() && focused(), () => settings.bpm], ([enabled, bpm]) => {
      if (!enabled) return;
      let beat = 0;
      const id = window.setInterval(() => playTick(beat++ % 4 === 0), 60000 / bpm);
      onCleanup(() => clearInterval(id));
    }),
  );

  const progress = () => (session().chars.length ? (session().pos / session().chars.length) * 100 : 0);

  return (
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-1.5">
          <For each={props.exercises}>
            {(ex, i) => (
              <span
                classList={{
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors": true,
                  "bg-indigo-600 text-white": i() === step(),
                  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300": i() < step() || (i() === step() && isFinished(session())),
                  "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400": i() > step(),
                }}
              >
                {i() < step() ? "✓ " : ""}
                {t(`exercise.${ex.kind}`)}
              </span>
            )}
          </For>
        </div>
        <div class="flex items-center gap-5 font-mono text-sm tabular-nums">
          <Show
            when={props.timeLimitMs}
            fallback={
              <div title={t("metrics.wpmLong")}>
                <span class="text-xl font-semibold">{round(live().wpm)}</span> <span class="text-slate-500">{t("metrics.wpm")}</span>
              </div>
            }
          >
            <div title={t("metrics.wordsLong")}>
              <span class="text-xl font-semibold">{liveWords()}</span> <span class="text-slate-500">{t("metrics.words")}</span>
            </div>
          </Show>
          <div>
            <span class="text-xl font-semibold">{pct(live().accuracy)}</span> <span class="text-slate-500">{t("metrics.accuracy")}</span>
          </div>
          <Show
            when={props.timeLimitMs}
            fallback={
              <div class="hidden sm:block">
                <span class="text-xl font-semibold">{formatDuration(live().durationMs)}</span>
              </div>
            }
          >
            <div title={t("metrics.remaining")}>
              <span class="text-xl font-semibold">{Math.ceil(remainingMs() / 1000)}</span> <span class="text-slate-500">{t("metrics.sec")}</span>
            </div>
          </Show>
        </div>
      </div>

      <Show when={capsLock()}>
        <div class="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          ⇪ {t("lesson.capsLock")}
        </div>
      </Show>

      <Show when={mismatch().mismatch && !mismatchDismissed()}>
        <div class="flex flex-wrap items-center gap-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          <span class="flex-1">
            {t("mismatch.text", { layout: t(`layouts.${settings.layout}`) })} {mismatch().suggestion ? "" : t("mismatch.unknown")}
          </span>
          <Show when={mismatch().suggestion}>
            {(s) => (
              <button
                class="rounded-lg bg-rose-600 px-3 py-1 font-medium text-white hover:bg-rose-700"
                onClick={() => {
                  setSettings("layout", s());
                  navigate("/lessons");
                }}
              >
                {t("mismatch.suggest", { layout: t(`layouts.${s()}`) })}
              </button>
            )}
          </Show>
          <button class="rounded-lg px-2 py-1 hover:bg-rose-100 dark:hover:bg-rose-500/20" onClick={() => setMismatchDismissed(true)}>
            {t("mismatch.dismiss")}
          </button>
        </div>
      </Show>

      <div class="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-10 sm:py-10">
        <div class="absolute inset-x-0 top-0 h-1 bg-slate-100 dark:bg-slate-800">
          <div class="h-full bg-indigo-500 transition-[width] duration-150" style={{ width: `${progress()}%` }} />
        </div>
        <div class="relative">
          <div class="transition-[filter] duration-200" classList={{ "blur-sm select-none": !focused() }}>
            <TypingArea session={session()} shake={shake()} lines={props.lines} />
          </div>
          <Show when={!focused()}>
            <button type="button" class="absolute inset-0 flex items-center justify-center text-base font-medium text-slate-700 dark:text-slate-200" onClick={() => window.focus()}>
              {t("lesson.focusHint")}
            </button>
          </Show>
        </div>
        <div class="mt-5 flex min-h-6 flex-wrap items-center justify-between gap-2 text-sm">
          <span class="text-slate-500 dark:text-slate-400">
            <Show when={session().startedAt === null} fallback={<Show when={hintActive()}>{instruction()}</Show>}>
              {t("lesson.start")} · <span class="text-slate-400">{instruction()}</span>
            </Show>
          </span>
          <span class="hidden text-xs text-slate-400 sm:inline">{t("lesson.restartHint")}</span>
        </div>
      </div>

      <div class="grid items-end gap-3" classList={{ "lg:grid-cols-[1fr_240px]": settings.showHands }}>
        <div class="transition-opacity duration-300" classList={{ "opacity-0 pointer-events-none": visibility() === "hidden" && !hintActive() }}>
          <Keyboard
            layout={props.layout}
            highlight={highlight()}
            faded={visibility() !== "full"}
            wrong={wrongCode()}
            pressed={visibility() === "full" ? pressedCode() : null}
          />
        </div>
        <Show when={settings.showHands}>
          <Hands active={activeFingers()} class="mx-auto hidden w-full max-w-[240px] lg:block" />
        </Show>
      </div>
    </div>
  );
}
