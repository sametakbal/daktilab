import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { LayoutId } from "../layouts/types";

export interface LeaderboardEntry {
    username: string;
    value: number;
}

/** A test whose passage and start time live on the server, so its score can't be forged. */
export interface RankedRun {
    id: string;
    text: string;
}

/** Asks the server for a scored test run; null when offline, signed out or the server refuses. */
export async function startRankedTest(lang: "tr" | "en", layout: LayoutId, client: SupabaseClient | null = supabase): Promise<RankedRun | null> {
    if (!client) return null;
    try {
        const { data, error } = await client.rpc("start_test", { p_lang: lang, p_layout: layout });
        const row = Array.isArray(data) ? data[0] : null;
        if (error || !row?.run_id || !row?.run_text) return null;
        return { id: row.run_id, text: row.run_text };
    } catch {
        return null;
    }
}

/** Sends what was typed; the server scores it and updates the leaderboard. Returns the server's score. */
export async function finishRankedTest(id: string, typed: string, accuracy: number, client: SupabaseClient | null = supabase): Promise<number | null> {
    if (!client) return null;
    try {
        const { data, error } = await client.rpc("finish_test", { p_run: id, p_typed: typed, p_accuracy: accuracy });
        return error || typeof data !== "number" ? null : data;
    } catch {
        return null;
    }
}

interface PersonalBestRow {
    best_wpm: number;
    profiles: { username: string } | null;
}

export async function fetchWpmLeaderboard(layout: LayoutId, limit = 50): Promise<LeaderboardEntry[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from("personal_bests")
        .select("best_wpm, profiles(username)")
        .eq("layout", layout)
        .order("best_wpm", { ascending: false })
        .limit(limit);
    if (error || !data) return [];
    return (data as unknown as PersonalBestRow[]).map((r) => ({ username: r.profiles?.username ?? "?", value: r.best_wpm }));
}

interface UserStatsRow {
    longest_streak: number;
    profiles: { username: string } | null;
}

export async function fetchStreakLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from("user_stats")
        .select("longest_streak, profiles(username)")
        .order("longest_streak", { ascending: false })
        .limit(limit);
    if (error || !data) return [];
    return (data as unknown as UserStatsRow[]).map((r) => ({ username: r.profiles?.username ?? "?", value: r.longest_streak }));
}
