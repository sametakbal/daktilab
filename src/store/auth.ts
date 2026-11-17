import { createRoot, createSignal } from "solid-js";
import { api, apiEnabled, apiUrl, ApiError } from "../lib/api";

export interface User {
    id: string;
    email: string | null;
}

export interface Profile {
    id: string;
    username: string;
}

interface Me {
    user: User | null;
    profile: Profile | null;
}

function createAuthStore() {
    const [user, setUser] = createSignal<User | null>(null);
    const [profile, setProfile] = createSignal<Profile | null>(null);
    const [ready, setReady] = createSignal(!apiEnabled);

    const apply = (me: Me) => {
        setUser(me.user);
        setProfile(me.profile);
    };

    /** Re-reads the session from the server (on load, after OAuth redirects, or when a request gets 401). */
    async function refresh(): Promise<void> {
        if (!apiEnabled) return;
        try {
            apply(await api<Me>("GET", "/auth/me"));
        } catch {
            // Offline or server down: keep whatever we had.
        } finally {
            setReady(true);
        }
    }

    if (apiEnabled) void refresh();

    async function signUpWithPassword(email: string, password: string): Promise<void> {
        apply(await api<Me>("POST", "/auth/signup", { email, password }));
    }

    async function signInWithPassword(email: string, password: string): Promise<void> {
        apply(await api<Me>("POST", "/auth/login", { email, password }));
    }

    /** Full-page redirect through the provider; the server sends the browser back here signed in. */
    async function signInWithOAuth(provider: "google" | "github"): Promise<void> {
        window.location.assign(apiUrl(`/auth/oauth/${provider}/start?redirect=${encodeURIComponent(window.location.href)}`));
    }

    async function signOut(): Promise<void> {
        if (!apiEnabled) return;
        await api("POST", "/auth/logout").catch(() => {});
        apply({ user: null, profile: null });
    }

    /** Claims a username for the signed-in user (first login), or renames it later. */
    async function claimUsername(username: string): Promise<{ ok: boolean; error?: string }> {
        if (!apiEnabled) return { ok: false, error: "Backend is not configured" };
        if (!user()) return { ok: false, error: "Not signed in" };
        try {
            setProfile(await api<Profile>("PUT", "/profile", { username }));
            return { ok: true };
        } catch (err) {
            if (err instanceof ApiError && err.status === 401) void refresh();
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    return { user, profile, ready, refresh, signUpWithPassword, signInWithPassword, signInWithOAuth, signOut, claimUsername };
}

export const auth = createRoot(createAuthStore);
