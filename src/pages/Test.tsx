import { createEffect, createSignal, Match, Show, Switch } from "solid-js";
import { buildTest, type Exercise } from "../curriculum/generator";
import { t } from "../i18n";
import { LAYOUTS } from "../layouts";
import { finishRankedTest, type RankedRun, startRankedTest } from "../lib/leaderboard";
import { prefetchTestWords, takeTestWords } from "../lib/testWords";
import Runner, { type RunResult } from "../components/Runner";
import ResultCard from "../components/ResultCard";
import { Button, Card } from "../components/ui";
import { recordResult } from "../store/progress";
import { settings } from "../store/settings";
import { auth } from "../store/auth";

const TEST_MS = 60_000;
/** How long "start" waits for the server before falling back to an unranked local test. */
const START_TIMEOUT_MS = 3000;

const withTimeout = <T,>(p: Promise<T | null>, ms: number): Promise<T | null> =>
    Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

export default function TestPage() {
    const layout = () => LAYOUTS[settings.layout];
    const [run, setRun] = createSignal<Exercise[] | null>(null);
    const [result, setResult] = createSignal<RunResult | null>(null);
    const [submitted, setSubmitted] = createSignal(false);
    const [rankFailed, setRankFailed] = createSignal(false);
    const [loading, setLoading] = createSignal(false);
    /** Server-side run backing the current attempt; null for local, unranked attempts. */
    let ranked: RankedRun | null = null;

    // Keep a batch of database words ready so starting a test doesn't wait on the network.
    createEffect(() => prefetchTestWords(settings.lang));

    const start = async () => {
        if (loading()) return;
        setLoading(true);
        const lang = settings.lang;
        const canRank = !!auth.user() && !!auth.profile();
        // Ranked attempts get their passage from the server, which later scores what was typed.
        ranked = canRank ? await withTimeout(startRankedTest(lang, settings.layout), START_TIMEOUT_MS) : null;
        const exercises: Exercise[] = ranked
            ? [{ kind: "words", text: ranked.text }]
            : buildTest(layout(), lang, Math.floor(Math.random() * 2 ** 32), (await takeTestWords(lang)) ?? undefined);
        setLoading(false);
        setResult(null);
        setSubmitted(false);
        setRankFailed(canRank && !ranked);
        setRun(exercises);
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
        const current = ranked;
        ranked = null;
        if (!current) return;
        const score = await finishRankedTest(current.id, r.typed[0] ?? "", r.metrics.accuracy);
        setSubmitted(score !== null);
        setRankFailed(score === null);
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
                            <Show when={rankFailed()}>
                                <p class="text-center text-sm text-amber-600 dark:text-amber-400">{t("test.notRanked")}</p>
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
