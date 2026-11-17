import { api, apiEnabled } from "./api";
import type { LayoutId } from "../layouts/types";

export interface LeaderboardEntry {
    username: string;
    value: number;
}

/**
 * Records a daily-test attempt; the server updates the personal best and streak boards.
 * Returns whether the score was accepted.
 */
export async function submitTestScore(layout: LayoutId, wpm: number, accuracy: number, currentStreak: number): Promise<boolean> {
    if (!apiEnabled) return false;
    try {
        await api("POST", "/scores", { layout, wpm, accuracy, currentStreak });
        return true;
    } catch {
        return false;
    }
}

export async function fetchWpmLeaderboard(layout: LayoutId, limit = 50): Promise<LeaderboardEntry[]> {
    if (!apiEnabled) return [];
    return api<LeaderboardEntry[]>("GET", `/leaderboard/wpm?layout=${encodeURIComponent(layout)}&limit=${limit}`).catch(() => []);
}

export async function fetchStreakLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
    if (!apiEnabled) return [];
    return api<LeaderboardEntry[]>("GET", `/leaderboard/streak?limit=${limit}`).catch(() => []);
}
