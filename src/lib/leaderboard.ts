import { supabase } from "./supabase";
import type { LayoutId } from "../layouts/types";

export interface LeaderboardEntry {
    username: string;
    value: number;
}

/** Records a daily-test attempt and updates the leaderboard tables (personal best + streak). */
export async function submitTestScore(
    layout: LayoutId,
    wpm: number,
    accuracy: number,
    currentStreak: number,
    userId: string,
): Promise<void> {
    if (!supabase) return;
    const today = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();

    await supabase.from("daily_test_scores").insert({ user_id: userId, layout, test_date: today, wpm, accuracy });

    const { data: best } = await supabase.from("personal_bests").select("best_wpm").eq("user_id", userId).eq("layout", layout).maybeSingle();
    if (!best || wpm > best.best_wpm) {
        await supabase.from("personal_bests").upsert({ user_id: userId, layout, best_wpm: wpm, best_accuracy: accuracy, achieved_at: nowIso });
    }

    const { data: stats } = await supabase.from("user_stats").select("longest_streak").eq("user_id", userId).maybeSingle();
    await supabase.from("user_stats").upsert({
        user_id: userId,
        current_streak: currentStreak,
        longest_streak: Math.max(currentStreak, stats?.longest_streak ?? 0),
        last_practice_date: today,
        updated_at: nowIso,
    });
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
