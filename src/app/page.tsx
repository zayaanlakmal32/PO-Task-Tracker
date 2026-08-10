"use client";

import { useEffect, useState, useCallback } from "react";
import type { PodMetrics, WeeklyReport } from "@/lib/types";

function StatTile({
  label,
  value,
  delta,
  deltaSuffix = "pts",
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaSuffix?: string;
}) {
  const hasDelta = delta !== undefined;
  const deltaColorClass =
    delta === null || delta === undefined
      ? "text-ink-muted"
      : delta >= 0
      ? "text-status-good"
      : "text-status-critical";
  const arrow = delta === null || delta === undefined ? "" : delta > 0 ? "▲" : delta < 0 ? "▼" : "–";

  return (
    <div className="bg-surface border border-hairline rounded-xl p-4 flex-1 min-w-[150px]">
      <div className="text-xs text-ink-muted mb-1">{label}</div>
      <div className="text-2xl font-semibold text-ink-primary tabular-nums">{value}</div>
      {hasDelta && (
        <div className={`text-xs mt-1 font-medium ${deltaColorClass}`}>
          {delta === null ? "n/a (first report)" : `${arrow} ${Math.abs(delta).toFixed(1)} ${deltaSuffix} vs last week`}
        </div>
      )}
    </div>
  );
}

function PodBar({ metrics }: { metrics: PodMetrics }) {
  const total = metrics.total || 1;
  const doneW = (metrics.completed / total) * 100;
  const progW = (metrics.inProgress / total) * 100;
  const notW = (metrics.notStarted / total) * 100;

  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium text-ink-primary">{metrics.pod}</span>
        <span className="text-xs text-ink-muted tabular-nums">{metrics.total} tasks</span>
      </div>
      <div className="h-3 rounded-full overflow-hidden flex bg-hairline/40" style={{ background: "var(--gridline)" }}>
        {doneW > 0 && <div style={{ width: `${doneW}%`, background: "var(--status-good)" }} />}
        {progW > 0 && <div style={{ width: `${progW}%`, background: "var(--series-1)", marginLeft: doneW > 0 ? 2 : 0 }} />}
        {notW > 0 && <div style={{ width: `${notW}%`, background: "var(--text-muted)", marginLeft: progW > 0 || doneW > 0 ? 2 : 0 }} />}
      </div>
      <div className="flex gap-4 mt-1.5 text-xs text-ink-secondary tabular-nums">
        <span>Done {metrics.pctCompleted}%</span>
        <span>In progress {metrics.pctInProgress}%</span>
        <span>Not started {metrics.pctNotStarted}%</span>
        {metrics.wowCompletionChange !== null && (
          <span className={metrics.wowCompletionChange >= 0 ? "text-status-good" : "text-status-critical"}>
            {metrics.wowCompletionChange >= 0 ? "▲" : "▼"} {Math.abs(metrics.wowCompletionChange).toFixed(1)}pt WoW
          </span>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<"pdf" | "csv" | null>(null);
  const [weekOverride, setWeekOverride] = useState<string | null>(null);

  const load = useCallback(async (weekStart: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const url = weekStart ? `/api/metrics?weekStart=${weekStart}` : "/api/metrics";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load metrics");
      setReport(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(weekOverride);
  }, [weekOverride, load]);

  function shiftWeekClient(deltaDays: number) {
    if (!report) return;
    const d = new Date(`${report.weekStart}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + deltaDays);
    setWeekOverride(d.toISOString().slice(0, 10));
  }

  async function generate(format: "pdf" | "csv") {
    if (!report) return;
    setGenerating(format);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, weekStart: report.weekStart }),
      });
      if (!res.ok) throw new Error("Report generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pod-task-report-${report.weekStart}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      // refresh so the WoW deltas reflect the snapshot we just wrote
      load(weekOverride);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(null);
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-primary">POD Task Dashboard</h1>
          <p className="text-sm text-ink-secondary mt-1">
            Live status of client tasks, grouped by POD. Source: Client_Task Tracker (Notion).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => generate("csv")}
            disabled={!report || generating !== null}
            className="border border-hairline rounded-lg px-4 py-2 text-sm font-medium text-ink-primary disabled:opacity-50"
          >
            {generating === "csv" ? "Generating…" : "Download CSV"}
          </button>
          <button
            onClick={() => generate("pdf")}
            disabled={!report || generating !== null}
            className="bg-series-1 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {generating === "pdf" ? "Generating…" : "Generate Report (PDF)"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-surface border border-status-critical/30 text-status-critical rounded-lg p-4 mb-6 text-sm">
          {error}
        </div>
      )}

      {report && (
        <>
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => shiftWeekClient(-7)}
              className="border border-hairline rounded-md px-2.5 py-1 text-sm text-ink-secondary"
              aria-label="Previous week"
            >
              ←
            </button>
            <span className="text-sm font-medium text-ink-primary tabular-nums">
              {report.weekStart} – {report.weekEnd}
            </span>
            <button
              onClick={() => shiftWeekClient(7)}
              className="border border-hairline rounded-md px-2.5 py-1 text-sm text-ink-secondary"
              aria-label="Next week"
            >
              →
            </button>
            {!report.hasPriorSnapshot && (
              <span className="text-xs text-ink-muted italic">
                No prior snapshot yet — WoW deltas appear after your first Generate Report.
              </span>
            )}
          </div>

          <div className="flex gap-4 mb-10 flex-wrap">
            <StatTile label="Total tasks" value={`${report.overall.total}`} />
            <StatTile label="% Completed" value={`${report.overall.pctCompleted}%`} delta={report.overall.wowCompletionChange} />
            <StatTile label="% In progress" value={`${report.overall.pctInProgress}%`} />
            <StatTile label="% Not started" value={`${report.overall.pctNotStarted}%`} />
            <StatTile
              label="Net task change"
              value={report.overall.netTaskChange === null ? "n/a" : `${report.overall.netTaskChange >= 0 ? "+" : ""}${report.overall.netTaskChange}`}
              deltaSuffix="tasks"
            />
          </div>

          <div className="flex gap-4 mb-4 text-xs text-ink-secondary">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--status-good)" }} /> Done
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--series-1)" }} /> In progress
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--text-muted)" }} /> Not started
            </span>
          </div>

          <div className="bg-surface border border-hairline rounded-xl p-6">
            <h2 className="text-sm font-semibold text-ink-primary mb-4">By POD</h2>
            {report.byPod.length === 0 && (
              <p className="text-sm text-ink-muted">No tasks found for this week.</p>
            )}
            {report.byPod.map((p) => (
              <PodBar key={p.pod} metrics={p} />
            ))}
          </div>
        </>
      )}

      {loading && !report && <p className="text-sm text-ink-muted">Loading…</p>}
    </main>
  );
}
