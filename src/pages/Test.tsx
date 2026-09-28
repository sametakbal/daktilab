import { createEffect, createSignal, Match, Show, Switch } from "solid-js";
import { buildTest, type Exercise } from "../curriculum/generator";
import { t } from "../i18n";
import { LAYOUTS } from "../layouts";
import { submitTestScore } from "../lib/leaderboard";
import { prefetchTestWords, takeTestWords } from "../lib/testWords";
import Runner, { type RunResult } from "../components/Runner";
import ResultCard from "../components/ResultCard";
import { Button, Card } from "../components/ui";
import { progress, recordResult, streakDays } from "../store/progress";
import { settings } from "../store/settings";
import { auth } from "../store/auth";

const TEST_MS = 60_000;

export default function TestPage() {
    const layout = () => LAYOUTS[settings.layout];
    const [run, setRun] = createSignal<Exercise[] | null>(null);
    const [result, setResult] = createSignal<RunResult | null>(null);
    const [submitted, setSubmitted] = createSignal(false);
    const [loading, setLoading] = createSignal(false);

    // Keep a batch of database words ready so starting a test doesn't wait on the network.
    createEffect(() => prefetchTestWords(settings.lang));

    const start = async () => {
        if (loading()) return;
        setLoading(true);
        const lang = settings.lang;
        const words = await takeTestWords(lang);
        setLoading(false);
        setResult(null);
        setSubmitted(false);
        // Fresh words on every attempt; the fixed time limit keeps scores comparable.
        setRun(buildTest(layout(), lang, Math.floor(Math.random() * 2 ** 32), words ?? undefined));
    };

    const startButton = (label: string) => (
        <Button onClick={start} disabled={loading()}>
            {loading() ? t("test.loading") : label}
        </Button>
    );

    const complete = async (r: RunResult) => {
        recordResult({ layout: settings.layout, lesson: null, metrics: r.metrics, charStats: r.charStats, bigramMisses: r.bigramMisses });
        setRun(null);
        setResult(r);
        const uid = auth.user()?.id;
        if (uid && auth.profile()) {
            await submitTestScore(settings.layout, r.metrics.wpm, r.metrics.accuracy, streakDays(progress.history), uid);
            setSubmitted(true);
        }
    };

    return (
        <div class="flex flex-col gap-6">
            <div>
                <h1 class="text-3xl font-extrabold tracking-tight">{t("test.title")}</h1>
                <p class="mt-1 text-slate-500 dark:text-slate-400">{t("test.sub")}</p>
            </div>

            <Switch>
                <Match when={run()} keyed>
                    {(ex) => <Runner layout={layout()} exercises={ex} visibility="faded" onComplete={complete} timeLimitMs={TEST_MS} lines={3} />}
                </Match>
                <Match when={result()}>
                    {(r) => (
                        <>
                            <ResultCard layout={layout()} scoreLabel={t("metrics.wordsLong")} metrics={r().metrics} charStats={r().charStats} actions={startButton(t("result.retry"))} />
                            <Show when={submitted()}>
                                <p class="text-center text-sm text-emerald-600 dark:text-emerald-400">{t("test.submitted")}</p>
                            </Show>
                            <Show when={auth.user() && !auth.profile()}>
                                <p class="text-center text-sm text-slate-500 dark:text-slate-400">{t("test.usernameHint")}</p>
                            </Show>
                            <Show when={!auth.user()}>
                                <p class="text-center text-sm text-slate-500 dark:text-slate-400">{t("test.signInHint")}</p>
                            </Show>
                        </>
                    )}
                </Match>
                <Match when={true}>
                    <Card class="flex flex-col items-start gap-4">
                        <p class="text-sm text-slate-600 dark:text-slate-400">{t("test.desc")}</p>
                        {startButton(t("test.start"))}
                    </Card>
                </Match>
            </Switch>
        </div>
    );
}
