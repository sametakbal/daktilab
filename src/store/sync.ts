import { createEffect, createRoot, createSignal } from "solid-js";
import { supabase } from "../lib/supabase";
import type { LayoutId } from "../layouts/types";
import { auth } from "./auth";
import { HISTORY_LIMIT, progress, setProgress, type CharRecord, type HistoryEntry, type LayoutProgress, type Progress } from "./progress";

/** Per-field max merge: safe to re-run repeatedly, never loses a better record. */
function mergeLayoutProgress(a: LayoutProgress | undefined, b: LayoutProgress | undefined): LayoutProgress {
    if (!a) return b ?? { lessons: {}, chars: {}, bigrams: {} };
    if (!b) return a;

    const lessons = { ...a.lessons };
    for (const [id, rb] of Object.entries(b.lessons)) {
        const ra = lessons[id];
        lessons[id] = ra
            ? {
                bestWpm: Math.max(ra.bestWpm, rb.bestWpm),
                bestAcc: Math.max(ra.bestAcc, rb.bestAcc),
                stars: Math.max(ra.stars, rb.stars),
                attempts: Math.max(ra.attempts, rb.attempts),
                lastAt: Math.max(ra.lastAt, rb.lastAt),
            }
            : rb;
    }

    // Char/bigram counters aren't safe to sum across snapshots (no delta tracking), so keep the richer side.
    const chars: Record<string, CharRecord> = { ...a.chars };
    for (const [ch, cb] of Object.entries(b.chars)) {
        const ca = chars[ch];
        chars[ch] = !ca || cb.hits + cb.misses > ca.hits + ca.misses ? cb : ca;
    }

    const bigrams = { ...a.bigrams };
    for (const [bg, n] of Object.entries(b.bigrams)) bigrams[bg] = Math.max(bigrams[bg] ?? 0, n);

    return { lessons, chars, bigrams };
}

/** Pure merge of two Progress snapshots (e.g. local vs. what's stored remotely). */
export function mergeProgress(local: Progress, remote: Progress): Progress {
    const layoutIds = new Set<LayoutId>([...(Object.keys(local.layouts) as LayoutId[]), ...(Object.keys(remote.layouts) as LayoutId[])]);
    const layouts: Progress["layouts"] = {};
    for (const id of layoutIds) layouts[id] = mergeLayoutProgress(local.layouts[id], remote.layouts[id]);

    const byAt = new Map<number, HistoryEntry>();
    for (const h of [...local.history, ...remote.history]) byAt.set(h.at, h);
    const history = [...byAt.values()].sort((a, b) => a.at - b.at).slice(-HISTORY_LIMIT);

    return { layouts, history };
}

let lastPushed = "";
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pulledFor: string | null = null;
const [status, setStatus] = createSignal<"idle" | "syncing" | "synced" | "error">("idle");

async function pull(userId: string): Promise<void> {
    if (!supabase) return;
    const { data, error } = await supabase.from("progress_sync").select("data").eq("user_id", userId).maybeSingle();
    if (error || !data) return;
    setProgress(mergeProgress(progress, data.data as Progress));
}

async function push(): Promise<void> {
    if (!supabase) return;
    const uid = auth.user()?.id;
    if (!uid || !navigator.onLine) return;
    // Store proxies can't be structuredClone'd; a JSON round-trip gives a plain snapshot.
    const payload = JSON.stringify(progress);
    if (payload === lastPushed) return;
    const snapshot: Progress = JSON.parse(payload);
    setStatus("syncing");
    const { error } = await supabase.from("progress_sync").upsert({ user_id: uid, data: snapshot, updated_at: new Date().toISOString() });
    setStatus(error ? "error" : "synced");
    if (!error) lastPushed = payload;
}

function schedulePush(): void {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 2000);
}

function createSyncStore() {
    createEffect(() => {
        const uid = auth.user()?.id;
        if (uid && uid !== pulledFor) {
            pulledFor = uid;
            void pull(uid);
        }
    });

    createEffect(() => {
        JSON.stringify(progress); // track the whole store so any mutation re-runs this
        if (auth.user()) schedulePush();
    });

    if (typeof window !== "undefined") {
        window.addEventListener("online", () => {
            if (auth.user()) void push();
        });
    }

    return { status, push, pull };
}

export const sync = createRoot(createSyncStore);
