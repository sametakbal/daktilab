import { useNavigate } from "@solidjs/router";
import { createSignal, type JSX, Show } from "solid-js";
import { t } from "../i18n";
import { LAYOUT_IDS } from "../layouts";
import { Button, Card, Segmented, Toggle } from "../components/ui";
import { importProgress, progress, resetProgress } from "../store/progress";
import { setSettings, settings, type KeyboardMode, type Theme } from "../store/settings";

function Row(props: { label: string; description?: string; children: JSX.Element }) {
  return (
    <div class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="max-w-md">
        <div class="text-sm font-medium">{props.label}</div>
        <Show when={props.description}>
          <div class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{props.description}</div>
        </Show>
      </div>
      {props.children}
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [message, setMessage] = createSignal("");
  let fileInput: HTMLInputElement | undefined;

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ progress, settings }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `daktilab-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      setMessage(importProgress(data.progress ?? data) ? t("settings.importOk") : t("settings.importFail"));
    } catch {
      setMessage(t("settings.importFail"));
    }
  };

  return (
    <div class="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 class="text-3xl font-extrabold tracking-tight">{t("settings.title")}</h1>

      <Card class="divide-y divide-slate-100 !py-1 dark:divide-slate-800">
        <Row label={t("settings.layout")} description={t("settings.layoutDesc")}>
          <Segmented value={settings.layout} options={LAYOUT_IDS.map((id) => ({ value: id, label: t(`layouts.${id}`) }))} onChange={(v) => setSettings("layout", v)} />
        </Row>
        <Row label={t("settings.lang")}>
          <Segmented value={settings.lang} options={[{ value: "tr", label: "Türkçe" }, { value: "en", label: "English" }]} onChange={(v) => setSettings("lang", v)} />
        </Row>
        <Row label={t("settings.theme")}>
          <Segmented<Theme>
            value={settings.theme}
            options={(["system", "light", "dark"] as const).map((v) => ({ value: v, label: t(`settings.themes.${v}`) }))}
            onChange={(v) => setSettings("theme", v)}
          />
        </Row>
      </Card>

      <Card class="divide-y divide-slate-100 !py-1 dark:divide-slate-800">
        <Row label={t("settings.errorMode")} description={t("settings.errorModeDesc")}>
          <Segmented
            value={settings.errorMode}
            options={(["stop", "continue"] as const).map((v) => ({ value: v, label: t(`settings.errorModes.${v}`) }))}
            onChange={(v) => setSettings("errorMode", v)}
          />
        </Row>
        <Row label={t("settings.keyboard")} description={t("settings.keyboardDesc")}>
          <Segmented<KeyboardMode>
            value={settings.keyboard}
            options={(["auto", "full", "faded", "hidden"] as const).map((v) => ({ value: v, label: t(`settings.keyboards.${v}`) }))}
            onChange={(v) => setSettings("keyboard", v)}
          />
        </Row>
        <div class="py-4">
          <Toggle label={t("settings.hands")} checked={settings.showHands} onChange={(v) => setSettings("showHands", v)} />
        </div>
        <div class="py-4">
          <Toggle label={t("settings.sound")} checked={settings.sound} onChange={(v) => setSettings("sound", v)} />
        </div>
        <div class="py-4">
          <Toggle label={t("settings.metronome")} description={t("settings.metronomeDesc")} checked={settings.metronome} onChange={(v) => setSettings("metronome", v)} />
          <Show when={settings.metronome}>
            <label class="mt-3 flex items-center gap-3 text-sm">
              <span class="text-slate-500">{t("settings.bpm")}</span>
              <input type="range" min="40" max="240" step="5" value={settings.bpm} onInput={(e) => setSettings("bpm", Number(e.currentTarget.value))} class="flex-1 accent-indigo-600" />
              <span class="w-10 text-right font-mono tabular-nums">{settings.bpm}</span>
            </label>
          </Show>
        </div>
        <div class="py-4">
          <Toggle label={t("settings.unlockAll")} description={t("settings.unlockAllDesc")} checked={settings.unlockAll} onChange={(v) => setSettings("unlockAll", v)} />
        </div>
      </Card>

      <Card>
        <div class="text-sm font-medium">{t("settings.data")}</div>
        <div class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t("settings.dataDesc")}</div>
        <div class="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportData}>
            {t("settings.export")}
          </Button>
          <Button variant="secondary" onClick={() => fileInput?.click()}>
            {t("settings.import")}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            class="hidden"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void importData(f);
              e.currentTarget.value = "";
            }}
          />
          <Button
            variant="secondary"
            onClick={() => {
              setSettings("onboarded", false);
              navigate("/onboarding");
            }}
          >
            {t("settings.onboarding")}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm(t("settings.resetConfirm"))) resetProgress();
            }}
          >
            {t("settings.reset")}
          </Button>
        </div>
        <Show when={message()}>
          <p class="mt-3 text-sm text-slate-600 dark:text-slate-300">{message()}</p>
        </Show>
      </Card>
    </div>
  );
}
