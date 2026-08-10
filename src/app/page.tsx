"use client";

import { useEffect, useState, useCallback } from "react";
import type { PodMetrics, PoMetrics, WeeklyReport } from "@/lib/types";

function Delta({ value, suffix = "pts" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-ink-muted">n/a (first report)</span>;
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "–";
  const cls = value >= 0 ? "text-status-good" : "text-status-critical";
  return (
    <span className={cls}>
      {arrow} {Math.abs(value).toFixed(1)} {suffix} vs last week
    </span>
  );
}

function StatCard({
  label,
  value,
  valueClass = "text-ink-primary",
  sub,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-hairline rounded-xl p-4 flex-1 min-w-[160px] shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted mb-1.5 font-medium">{label}</div>
      <div className={`text-[26px] leading-tight font-semibold tabular-nums ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs mt-1.5">{sub}</div>}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex gap-5 text-xs text-ink-secondary">
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
  );
}

function StackedBar({ metrics }: { metrics: PodMetrics }) {
  const total = metrics.total || 1;
  const doneW = (metrics.completed / total) * 100;
  const progW = (metrics.inProgress / total) * 100;
  const notW = (metrics.notStarted / total) * 100;
  return (
    <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: "var(--gridline)" }}>
      {doneW > 0 && <div style={{ width: `${doneW}%`, background: "var(--status-good)" }} />}
      {progW > 0 && <div style={{ width: `${progW}%`, background: "var(--series-1)", marginLeft: doneW > 0 ? 2 : 0 }} />}
      {notW > 0 && (
        <div style={{ width: `${notW}%`, background: "var(--text-muted)", marginLeft: progW > 0 || doneW > 0 ? 2 : 0 }} />
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-ink-primary">{children}</h2>
      <div className="h-[3px] w-7 rounded-full mt-1.5" style={{ background: "var(--series-1)" }} />
    </div>
  );
}

function PodRow({ metrics }: { metrics: PodMetrics }) {
  return (
    <div className="py-3.5 border-b border-hairline last:border-b-0">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium text-ink-primary">{metrics.pod}</span>
        <span className="text-xs text-ink-muted tabular-nums">{metrics.total} tasks</span>
      </div>
      <StackedBar metrics={metrics} />
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-ink-secondary tabular-nums">
        <span>Done {metrics.pctCompleted}%</span>
        <span>In progress {metrics.pctInProgress}%</span>
        <span>Not started {metrics.pctNotStarted}%</span>
        <Delta value={metrics.wowCompletionChange} />
      </div>
    </div>
  );
}

function PoCard({ metrics, expanded, onToggle }: { metrics: PoMetrics; expanded: boolean; onToggle: () => void }) {
  const name = metrics.pod.replace(/^PO - /, "");
  return (
    <div className="py-3.5 border-b border-hairline last:border-b-0">
      <button className="w-full text-left" onClick={onToggle}>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm font-medium text-ink-primary">
            {name}
            {metrics.clients.length > 0 && (
              <span className="text-ink-muted font-normal"> · {metrics.clients.length} client{metrics.clients.length === 1 ? "" : "s"}</span>
            )}
          </span>
          <span className="text-xs text-ink-muted tabular-nums flex items-center gap-2">
            {metrics.total} tasks
            <span className="text-ink-muted">{expanded ? "▲" : "▼"}</span>
          </span>
        </div>
        <StackedBar metrics={metrics} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-ink-secondary tabular-nums">
          <span>Done {metrics.pctCompleted}%</span>
          <span>In progress {metrics.pctInProgress}%</span>
          <span>Not started {metrics.pctNotStarted}%</span>
          <Delta value={metrics.wowCompletionChange} />
        </div>
      </button>

      {expanded && (
        <div className="mt-3 ml-3 pl-3 border-l-2 border-hairline space-y-2.5">
          {metrics.clients.length === 0 && <p className="text-xs text-ink-muted">No client attached to these tasks.</p>}
          {metrics.clients.map((cl) => (
            <div key={cl.client} className="flex items-center justify-between text-xs">
              <span className="text-ink-primary font-medium">{cl.client}</span>
              <span className="text-ink-muted tabular-nums">
                {cl.total} tasks · {cl.pctCompleted}% done
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<"pdf" | "csv" | null>(null);
  const [weekOverride, setWeekOverride] = useState<string | null>(null);
  const [view, setView] = useState<"pod" | "po">("pod");
  const [expandedPo, setExpandedPo] = useState<Set<string>>(new Set());

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

  function togglePo(name: string) {
    setExpandedPo((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Report generation failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pod-task-report-${report.weekStart}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      // refresh so the "vs last week" deltas reflect the snapshot we just wrote
      load(weekOverride);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-hairline bg-surface sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink-primary tracking-tight">POD Task Dashboard</h1>
            <p className="text-sm text-ink-secondary mt-1">
              Live status of client tasks, grouped by POD and PO. Source: Client_Task Tracker (Notion).
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => generate("csv")}
              disabled={!report || generating !== null}
              className="border border-hairline rounded-lg px-4 py-2 text-sm font-medium text-ink-primary disabled:opacity-50 hover:bg-plane transition-colors"
            >
              {generating === "csv" ? "Generating…" : "Download CSV"}
            </button>
            <button
              onClick={() => generate("pdf")}
              disabled={!report || generating !== null}
              className="bg-series-1 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {generating === "pdf" ? "Generating…" : "Generate Report (PDF)"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {error && (
          <div className="bg-surface border border-status-critical/30 text-status-critical rounded-lg p-4 mb-6 text-sm">
            {error}
          </div>
        )}

        {report && (
          <>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <button
                onClick={() => shiftWeekClient(-7)}
                className="border border-hairline rounded-md px-2.5 py-1 text-sm text-ink-secondary hover:bg-plane transition-colors"
                aria-label="Previous week"
              >
                ←
              </button>
              <span className="text-sm font-medium text-ink-primary tabular-nums">
                {report.weekStart} – {report.weekEnd}
              </span>
              <button
                onClick={() => shiftWeekClient(7)}
                className="border border-hairline rounded-md px-2.5 py-1 text-sm text-ink-secondary hover:bg-plane transition-colors"
                aria-label="Next week"
              >
                →
              </button>
            </div>

            <p className="text-xs text-ink-muted mb-6 max-w-2xl">
              <strong className="text-ink-secondary">"vs last week"</strong> compares this week's numbers to a snapshot
              saved the last time someone clicked Generate Report.
              {!report.hasPriorSnapshot && " No snapshot exists yet for these groups — it'll show n/a until after your next report."}
            </p>

            <div className="flex gap-4 mb-4 flex-wrap">
              <StatCard label="Total tasks" value={`${report.overall.total}`} />
              <StatCard
                label="% Completed"
                value={`${report.overall.pctCompleted}%`}
                valueClass="text-status-good"
                sub={<Delta value={report.overall.wowCompletionChange} />}
              />
              <StatCard label="% In progress" value={`${report.overall.pctInProgress}%`} valueClass="text-series-1" />
              <StatCard label="% Not started" value={`${report.overall.pctNotStarted}%`} />
              <StatCard
                label="Net task change"
                value={
                  report.overall.netTaskChange === null
                    ? "n/a"
                    : `${report.overall.netTaskChange >= 0 ? "+" : ""}${report.overall.netTaskChange}`
                }
                sub={<span className="text-ink-muted">completed minus new</span>}
              />
            </div>

            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <Legend />
              <div className="inline-flex rounded-lg border border-hairline p-0.5 bg-plane">
                <button
                  onClick={() => setView("pod")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    view === "pod" ? "bg-surface text-ink-primary shadow-sm" : "text-ink-muted"
                  }`}
                >
                  By POD
                </button>
                <button
                  onClick={() => setView("po")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    view === "po" ? "bg-surface text-ink-primary shadow-sm" : "text-ink-muted"
                  }`}
                >
                  By PO
                </button>
              </div>
            </div>

            <div className="bg-surface border border-hairline rounded-xl p-6 shadow-sm">
              {view === "pod" ? (
                <>
                  <SectionHeading>By POD</SectionHeading>
                  {report.byPod.length === 0 && <p className="text-sm text-ink-muted">No tasks found for this week.</p>}
                  {report.byPod.map((p) => (
                    <PodRow key={p.pod} metrics={p} />
                  ))}
                </>
              ) : (
                <>
                  <SectionHeading>By PO</SectionHeading>
                  <p className="text-xs text-ink-muted -mt-2 mb-3">Click a PO to see which clients their tasks belong to.</p>
                  {report.byPo.length === 0 && <p className="text-sm text-ink-muted">No tasks found for this week.</p>}
                  {report.byPo.map((p) => (
                    <PoCard
                      key={p.pod}
                      metrics={p}
                      expanded={expandedPo.has(p.pod)}
                      onToggle={() => togglePo(p.pod)}
                    />
                  ))}
                </>
              )}
            </div>
          </>
        )}

        {loading && !report && <p className="text-sm text-ink-muted">Loading…</p>}
      </main>
    </div>
  );
}
