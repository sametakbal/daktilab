import { createSignal, Show } from "solid-js";
import { t } from "../i18n";
import { Button, Card } from "../components/ui";
import { auth } from "../store/auth";
import { supabase } from "../lib/supabase";

export default function Login() {
    const [email, setEmail] = createSignal("");
    const [password, setPassword] = createSignal("");
    const [mode, setMode] = createSignal<"signin" | "signup">("signin");
    const [username, setUsername] = createSignal("");
    const [error, setError] = createSignal("");
    const [busy, setBusy] = createSignal(false);

    const submit = async (e: Event) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
            if (mode() === "signup") await auth.signUpWithPassword(email(), password());
            else await auth.signInWithPassword(email(), password());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    const claimUsername = async (e: Event) => {
        e.preventDefault();
        setError("");
        const r = await auth.claimUsername(username().trim());
        if (!r.ok) setError(r.error ?? "");
    };

    const inputClass = "rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

    return (
        <div class="mx-auto flex max-w-sm flex-col gap-6">
            <h1 class="text-3xl font-extrabold tracking-tight">{t("auth.title")}</h1>

            <Show when={!supabase}>
                <Card>
                    <p class="text-sm text-slate-500">{t("auth.notConfigured")}</p>
                </Card>
            </Show>

            <Show when={supabase}>
                <Show
                    when={auth.user()}
                    fallback={
                        <Card class="flex flex-col gap-4">
                            <form class="flex flex-col gap-3" onSubmit={submit}>
                                <input type="email" required class={inputClass} placeholder={t("auth.email")} value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
                                <input type="password" required class={inputClass} placeholder={t("auth.password")} value={password()} onInput={(e) => setPassword(e.currentTarget.value)} />
                                <Show when={error()}>
                                    <p class="text-xs text-rose-600">{error()}</p>
                                </Show>
                                <Button type="submit" disabled={busy()}>
                                    {mode() === "signup" ? t("auth.signUp") : t("auth.signIn")}
                                </Button>
                            </form>
                            <button
                                type="button"
                                class="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                                onClick={() => setMode(mode() === "signup" ? "signin" : "signup")}
                            >
                                {mode() === "signup" ? t("auth.haveAccount") : t("auth.needAccount")}
                            </button>
                            <div class="flex flex-col gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                                <Button variant="secondary" onClick={() => auth.signInWithOAuth("google")}>
                                    {t("auth.continueWith", { provider: "Google" })}
                                </Button>
                                <Button variant="secondary" onClick={() => auth.signInWithOAuth("github")}>
                                    {t("auth.continueWith", { provider: "GitHub" })}
                                </Button>
                            </div>
                        </Card>
                    }
                >
                    <Show
                        when={auth.profile()}
                        fallback={
                            <Card class="flex flex-col gap-3">
                                <p class="text-sm">{t("auth.pickUsername")}</p>
                                <form class="flex flex-col gap-3" onSubmit={claimUsername}>
                                    <input class={inputClass} placeholder={t("auth.username")} value={username()} onInput={(e) => setUsername(e.currentTarget.value)} />
                                    <Show when={error()}>
                                        <p class="text-xs text-rose-600">{error()}</p>
                                    </Show>
                                    <Button type="submit">{t("auth.save")}</Button>
                                </form>
                            </Card>
                        }
                    >
                        {(p) => (
                            <Card class="flex flex-col gap-3">
                                <p class="text-sm">{t("auth.signedInAs", { name: p().username })}</p>
                                <Button variant="secondary" onClick={() => auth.signOut()}>
                                    {t("auth.signOut")}
                                </Button>
                            </Card>
                        )}
                    </Show>
                </Show>
            </Show>
        </div>
    );
}
