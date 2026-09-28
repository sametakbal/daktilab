import { createResource, createSignal, For, Show } from "solid-js";
import { t } from "../i18n";
import { LAYOUT_IDS } from "../layouts";
import type { LayoutId } from "../layouts/types";
import { fetchStreakLeaderboard, fetchWpmLeaderboard } from "../lib/leaderboard";
import { supabase } from "../lib/supabase";
import { Card, Segmented } from "../components/ui";
import { auth } from "../store/auth";

type Board = "wpm" | "streak";

export default function Leaderboard() {
    const [layout, setLayout] = createSignal<LayoutId>("tr-q");
    const [board, setBoard] = createSignal<Board>("wpm");

    const [entries] = createResource(
        () => [board(), layout()] as const,
        ([b, l]) => (b === "wpm" ? fetchWpmLeaderboard(l) : fetchStreakLeaderboard()),
    );

    return (
        <div class="flex flex-col gap-6">
            <div>
                <h1 class="text-3xl font-extrabold tracking-tight">{t("leaderboard.title")}</h1>
                <p class="mt-1 text-slate-500 dark:text-slate-400">{t("leaderboard.sub")}</p>
            </div>

            <Show when={!supabase}>
                <Card>
                    <p class="text-sm text-slate-500">{t("auth.notConfigured")}</p>
                </Card>
            </Show>

            <Show when={supabase}>
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <Segmented<Board>
                        value={board()}
                        options={[
                            { value: "wpm", label: t("leaderboard.byWpm") },
                            { value: "streak", label: t("leaderboard.byStreak") },
                        ]}
                        onChange={setBoard}
                    />
                    <Show when={board() === "wpm"}>
                        <Segmented<LayoutId> value={layout()} options={LAYOUT_IDS.map((id) => ({ value: id, label: t(`layouts.${id}`) }))} onChange={setLayout} />
                    </Show>
                </div>

                <Card class="overflow-hidden p-0!">
                    <Show when={!entries.loading} fallback={<p class="p-5 text-sm text-slate-500">…</p>}>
                        <Show when={(entries() ?? []).length > 0} fallback={<p class="p-5 text-sm text-slate-500">{t("leaderboard.empty")}</p>}>
                            <table class="w-full text-sm">
                                <thead class="border-b border-slate-100 text-left text-xs uppercase text-slate-400 dark:border-slate-800">
                                    <tr>
                                        <th class="px-4 py-2">#</th>
                                        <th class="px-4 py-2">{t("leaderboard.player")}</th>
                                        <th class="px-4 py-2 text-right">{board() === "wpm" ? t("metrics.wpm") : t("leaderboard.streakCol")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <For each={entries()}>
                                        {(row, i) => (
                                            <tr
                                                classList={{
                                                    "border-b border-slate-50 dark:border-slate-800/60": true,
                                                    "bg-indigo-50 dark:bg-indigo-500/10": row.username === auth.profile()?.username,
                                                }}
                                            >
                                                <td class="px-4 py-2 font-mono text-slate-400">{i() + 1}</td>
                                                <td class="px-4 py-2 font-medium">{row.username}</td>
                                                <td class="px-4 py-2 text-right font-mono tabular-nums">{Math.round(row.value)}</td>
                                            </tr>
                                        )}
                                    </For>
                                </tbody>
                            </table>
                        </Show>
                    </Show>
                </Card>
            </Show>
        </div>
    );
}
