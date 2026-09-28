import { createSignal, Match, Show, Switch } from "solid-js";
import { buildTest, type Exercise } from "../curriculum/generator";
import { t } from "../i18n";
import { LAYOUTS } from "../layouts";
import { hashString } from "../lib/rng";
import { submitTestScore } from "../lib/leaderboard";
import Runner, { type RunResult } from "../components/Runner";
import ResultCard from "../components/ResultCard";
import { Button, Card } from "../components/ui";
import { progress, recordResult, streakDays } from "../store/progress";
import { settings } from "../store/settings";
import { auth } from "../store/auth";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function TestPage() {
    const layout = () => LAYOUTS[settings.layout];
    const [run, setRun] = createSignal<Exercise[] | null>(null);
    const [result, setResult] = createSignal<RunResult | null>(null);
    const [submitted, setSubmitted] = createSignal(false);

    const start = () => {
        setResult(null);
        setSubmitted(false);
        // Same seed for everyone on a given day+layout+language, so daily-test scores are comparable.
        const seed = hashString(`${todayISO()}:${layout().id}:${settings.lang}`);
        setRun(buildTest(layout(), settings.lang, seed));
    };

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
                    {(ex) => <Runner layout={layout()} exercises={ex} visibility="faded" onComplete={complete} />}
                </Match>
                <Match when={result()}>
                    {(r) => (
                        <>
                            <ResultCard layout={layout()} metrics={r().metrics} charStats={r().charStats} actions={<Button onClick={start}>{t("result.retry")}</Button>} />
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
                        <Button onClick={start}>{t("test.start")}</Button>
                    </Card>
                </Match>
            </Switch>
        </div>
    );
}
