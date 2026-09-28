import { createMemo, For, Show } from "solid-js";
import { t } from "../i18n";
import { LAYOUTS, lower, strokeFor } from "../layouts";
import { formatDuration, keyName, pct, round } from "../lib/format";
import Keyboard from "../components/Keyboard";
import LineChart from "../components/LineChart";
import { Card, StatTile } from "../components/ui";
import { keyInsights, layoutProgress, progress } from "../store/progress";
import { settings } from "../store/settings";

export default function Stats() {
  const layout = () => LAYOUTS[settings.layout];
  const history = createMemo(() => progress.history.filter((h) => h.layout === settings.layout));
  const recent = () => history().slice(-50);
  const last10 = () => history().slice(-10);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const insights = createMemo(() => keyInsights(settings.layout));

  // Aggregate per physical key (capitals count towards their letter's key).
  const perCode = createMemo(() => {
    const stats = layoutProgress(settings.layout).chars;
    const agg: Record<string, { hits: number; misses: number; lat: number; latN: number }> = {};
    for (const [ch, s] of Object.entries(stats)) {
      const stroke = strokeFor(layout(), ch) ?? strokeFor(layout(), lower(layout(), ch));
      if (!stroke) continue;
      const a = (agg[stroke.code] ??= { hits: 0, misses: 0, lat: 0, latN: 0 });
      a.hits += s.hits;
      a.misses += s.misses;
      a.lat += s.latencySum;
      a.latN += s.latencyCount;
    }
    return agg;
  });

  const heat = () => {
    const out: Record<string, number> = {};
    for (const [code, a] of Object.entries(perCode())) {
      const n = a.hits + a.misses;
      if (n >= 3) out[code] = Math.min(1, (a.misses / n) * 6);
    }
    return out;
  };

  const titles = () => {
    const out: Record<string, string> = {};
    for (const [code, a] of Object.entries(perCode())) {
      const n = a.hits + a.misses;
      out[code] = `${t("metrics.accuracy")}: ${round((a.hits / n) * 100)}% · ${a.latN ? round(a.lat / a.latN) : "–"} ms · n=${round(n)}`;
    }
    return out;
  };

  const slowest = () => [...insights()].filter((k) => k.samples >= 5).sort((a, b) => b.avgLatency - a.avgLatency).slice(0, 6);
  const weakest = () => [...insights()].filter((k) => k.missRate > 0).sort((a, b) => b.missRate - a.missRate).slice(0, 6);

  return (
    <div class="flex flex-col gap-6">
      <h1 class="text-3xl font-extrabold tracking-tight">{t("stats.title")}</h1>
      <Show when={history().length > 0} fallback={<Card><p class="text-slate-500">{t("stats.noData")}</p></Card>}>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatTile value={String(history().length)} label={t("stats.sessions")} />
          <StatTile value={formatDuration(history().reduce((a, h) => a + h.ms, 0))} label={t("stats.totalTime")} />
          <StatTile value={String(round(Math.max(0, ...history().filter((h) => h.acc >= 90).map((h) => h.wpm))))} label={t("stats.bestWpm")} />
          <StatTile value={String(round(avg(last10().map((h) => h.wpm))))} label={t("stats.avgWpm")} />
          <StatTile value={pct(avg(last10().map((h) => h.acc)))} label={t("stats.avgAcc")} />
        </div>

        <Show when={recent().length > 1}>
          <Card>
            <div class="mb-3 text-xs text-slate-500">{t("stats.chart")}</div>
            <div class="grid gap-6 md:grid-cols-2">
              <LineChart title={t("metrics.wpmLong")} values={recent().map((h) => h.wpm)} min={0} format={(v) => String(round(v))} />
              <LineChart
                title={t("metrics.accuracy")}
                values={recent().map((h) => h.acc)}
                min={Math.min(80, ...recent().map((h) => Math.floor(h.acc)))}
                max={100}
                format={(v) => `${round(v)}%`}
              />
            </div>
          </Card>
        </Show>

        <Card>
          <h2 class="font-semibold">{t("stats.heatmap")}</h2>
          <p class="mb-3 text-xs text-slate-500">{t("stats.heatmapDesc")}</p>
          <Keyboard layout={layout()} heat={heat()} titles={titles()} />
        </Card>

        <div class="grid gap-4 md:grid-cols-2">
          <KeyList title={t("stats.weakest")} items={weakest().map((k) => ({ ch: k.ch, value: `${round(k.missRate * 100)}%`, ratio: k.missRate }))} />
          <KeyList
            title={t("stats.slowest")}
            items={slowest().map((k, _i, arr) => ({ ch: k.ch, value: t("stats.ms", { ms: round(k.avgLatency) }), ratio: k.avgLatency / (arr[0]?.avgLatency || 1) }))}
          />
        </div>
      </Show>
    </div>
  );

  function KeyList(p: { title: string; items: { ch: string; value: string; ratio: number }[] }) {
    return (
      <Card>
        <h2 class="mb-3 font-semibold">{p.title}</h2>
        <Show when={p.items.length} fallback={<p class="text-sm text-slate-500">–</p>}>
          <div class="flex flex-col gap-2">
            <For each={p.items}>
              {(it) => (
                <div class="flex items-center gap-3 text-sm">
                  <span class="w-8 rounded-md bg-slate-100 py-1 text-center font-mono font-semibold dark:bg-slate-800">{keyName(layout(), it.ch)}</span>
                  <div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div class="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(4, Math.min(1, it.ratio) * 100)}%` }} />
                  </div>
                  <span class="w-16 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">{it.value}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Card>
    );
  }
}
