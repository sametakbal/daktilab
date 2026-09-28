import { createRoot, createSignal } from "solid-js";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export interface Profile {
    id: string;
    username: string;
}

function createAuthStore() {
    const [session, setSession] = createSignal<Session | null>(null);
    const [profile, setProfile] = createSignal<Profile | null>(null);
    const [ready, setReady] = createSignal(!supabase);

    async function loadProfile(userId: string) {
        if (!supabase) return;
        const { data } = await supabase.from("profiles").select("id, username").eq("id", userId).maybeSingle();
        setProfile(data ?? null);
    }

    if (supabase) {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            setReady(true);
            if (data.session) loadProfile(data.session.user.id);
        });
        supabase.auth.onAuthStateChange((_event, s) => {
            setSession(s);
            if (s) loadProfile(s.user.id);
            else setProfile(null);
        });
    }

    const user = (): User | null => session()?.user ?? null;

    async function signUpWithPassword(email: string, password: string): Promise<void> {
        if (!supabase) throw new Error("Supabase is not configured");
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
    }

    async function signInWithPassword(email: string, password: string): Promise<void> {
        if (!supabase) throw new Error("Supabase is not configured");
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    }

    async function signInWithOAuth(provider: "google" | "github"): Promise<void> {
        if (!supabase) throw new Error("Supabase is not configured");
        const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.href } });
        if (error) throw error;
    }

    async function signOut(): Promise<void> {
        if (!supabase) return;
        await supabase.auth.signOut();
    }

    /** Claims a username for the signed-in user (first login), or renames it later. */
    async function claimUsername(username: string): Promise<{ ok: boolean; error?: string }> {
        if (!supabase) return { ok: false, error: "Supabase is not configured" };
        const uid = user()?.id;
        if (!uid) return { ok: false, error: "Not signed in" };
        const { error } = await supabase.from("profiles").upsert({ id: uid, username });
        if (error) return { ok: false, error: error.message };
        await loadProfile(uid);
        return { ok: true };
    }

    return { session, user, profile, ready, signUpWithPassword, signInWithPassword, signInWithOAuth, signOut, claimUsername };
}

export const auth = createRoot(createAuthStore);
