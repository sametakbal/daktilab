import { A, HashRouter, Route, type RouteSectionProps } from "@solidjs/router";
import { createEffect, createSignal, For, lazy, onCleanup, onMount, Show } from "solid-js";
import { t } from "./i18n";
import { LAYOUT_IDS } from "./layouts";
import { auth } from "./store/auth";
import { setSettings, settings } from "./store/settings";
import "./store/sync"; // registers the background cloud-progress sync effects
import Home from "./pages/Home";

const Lessons = lazy(() => import("./pages/Lessons"));
const LessonPage = lazy(() => import("./pages/Lesson"));
const Practice = lazy(() => import("./pages/Practice"));
const TestPage = lazy(() => import("./pages/Test"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const Stats = lazy(() => import("./pages/Stats"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const Login = lazy(() => import("./pages/Login"));
const Onboarding = lazy(() => import("./pages/Onboarding"));

const REPO_URL = "https://github.com/sametakbal/daktilab";

function useTheme() {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const [systemDark, setSystemDark] = createSignal(media.matches);
  const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
  media.addEventListener("change", onChange);
  onCleanup(() => media.removeEventListener("change", onChange));
  createEffect(() => {
    const dark = settings.theme === "dark" || (settings.theme === "system" && systemDark());
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  });
  createEffect(() => (document.documentElement.lang = settings.lang));
}

function Shell(props: RouteSectionProps) {
  const [touchOnly, setTouchOnly] = createSignal(false);
  onMount(() => setTouchOnly(window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches));

  const links = [
    { href: "/", key: "nav.home", end: true },
    { href: "/lessons", key: "nav.lessons" },
    { href: "/practice", key: "nav.practice" },
    { href: "/test", key: "nav.test" },
    { href: "/leaderboard", key: "nav.leaderboard" },
    { href: "/stats", key: "nav.stats" },
    { href: "/settings", key: "nav.settings" },
  ] as const;

  return (
    <div class="flex min-h-dvh flex-col">
      <header class="sticky top-0 z-30 border-b border-slate-200/80 bg-slate-50/85 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/85">
        <div class="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <A href="/" class="flex shrink-0 items-center gap-2 font-bold tracking-tight">
            <img src="./daktilab-logo.png" alt={t("app.name")} class="h-9 w-auto" />
          </A>
          <nav class="-mx-1 flex flex-1 gap-1 overflow-x-auto">
            <For each={links}>
              {(l) => (
                <A
                  href={l.href}
                  end={"end" in l}
                  class="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  activeClass="!bg-indigo-50 !text-indigo-700 dark:!bg-indigo-500/15 dark:!text-indigo-300"
                >
                  {t(l.key)}
                </A>
              )}
            </For>
          </nav>
          <select
            aria-label={t("settings.layout")}
            class="hidden rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 md:block"
            value={settings.layout}
            onChange={(e) => setSettings("layout", e.currentTarget.value as (typeof LAYOUT_IDS)[number])}
          >
            <For each={LAYOUT_IDS}>{(id) => <option value={id}>{t(`layouts.${id}`)}</option>}</For>
          </select>
          <button
            class="rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => setSettings("lang", settings.lang === "tr" ? "en" : "tr")}
            aria-label={t("settings.lang")}
          >
            {settings.lang === "tr" ? "EN" : "TR"}
          </button>
          <A
            href="/login"
            class="whitespace-nowrap rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {auth.user() ? (auth.profile()?.username ?? t("auth.account")) : t("nav.login")}
          </A>
        </div>
      </header>
      <Show when={touchOnly()}>
        <div class="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">{t("touch")}</div>
      </Show>
      <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">{props.children}</main>
      <footer class="mx-auto w-full max-w-6xl px-4 pb-6 text-xs text-slate-400">
        {t("app.name")} · {t("app.tagline")} · {t("app.openSource")} —{" "}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 hover:text-indigo-500">
          {t("app.source")}
        </a>
      </footer>
    </div>
  );
}

export default function App() {
  useTheme();
  return (
    <HashRouter root={Shell}>
      <Route path="/" component={Home} />
      <Route path="/lessons" component={Lessons} />
      <Route path="/lesson/:id" component={LessonPage} />
      <Route path="/practice" component={Practice} />
      <Route path="/test" component={TestPage} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/stats" component={Stats} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/login" component={Login} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="*" component={Home} />
    </HashRouter>
  );
}
