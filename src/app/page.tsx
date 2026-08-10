"use client";

import { useEffect, useState, useCallback } from "react";
import type { Breakdown, PodMetrics, WeeklyReport } from "@/lib/types";
import { LOGO_PNG_BASE64 } from "@/lib/logo";

const LOGO_SRC = `data:image/png;base64,${LOGO_PNG_BASE64}`;

function trendColor(v: number | null): string {
  if (v === null) return "var(--text-muted)";
  return v >= 0 ? "var(--status-good)" : "var(--status-critical)";
}

function Delta({ value, suffix = "pts" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-ink-muted">n/a · first week</span>;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const cls = value >= 0 ? "text-status-good" : "text-status-critical";
  return (
    <span className={cls}>
      {sign}
      {Math.abs(value).toFixed(1)} {suffix} vs last week
    </span>
  );
}

/** Small inline trend chart. One point renders as a dot on a dashed baseline; 2+ points draw a line. */
function Sparkline({
  points,
  color,
  width = 90,
  height = 26,
}: {
  points: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (points.length === 0) return null;
  if (points.length === 1) {
    return (
      <svg width={width} height={height} className="shrink-0 overflow-visible">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--gridline)" strokeWidth={1} strokeDasharray="2,2" />
        <circle cx={width - 3} cy={height / 2} r={2.6} fill={color} />
      </svg>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const coords = points.map((p, i) => [i * stepX, height - ((p - min) / range) * height] as const);
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = coords[coords.length - 1];
  return (
    <svg width={width} height={height} className="shrink-0 overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.4} fill={color} />
    </svg>
  );
}

function StatCard({
  label,
  value,
  valueClass = "text-ink-primary",
  sub,
  accent,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="relative overflow-hidden bg-surface border border-hairline rounded-xl p-4 flex-1 min-w-[150px] shadow-sm">
      {accent && <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: accent }} />}
      <div className="text-[11px] uppercase tracking-wide text-ink-muted mb-1.5 font-medium">{label}</div>
      <div className={`text-[26px] leading-tight font-semibold tabular-nums ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs mt-1.5 text-ink-muted">{sub}</div>}
    </div>
  );
}

function TrendStatCard({
  label,
  value,
  valueClass,
  points,
  color,
}: {
  label: string;
  value: string;
  valueClass: string;
  points: number[];
  color: string;
}) {
  return (
    <div className="relative overflow-hidden bg-surface border border-hairline rounded-xl p-4 flex-1 min-w-[230px] shadow-sm">
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: color }} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-muted mb-1.5 font-medium">{label}</div>
          <div className={`text-lg font-semibold tabular-nums ${valueClass}`}>{value}</div>
        </div>
        <Sparkline points={points} color={color} width={78} height={30} />
      </div>
      <div className="text-[10px] text-ink-muted mt-1.5">
        {points.length <= 1 ? "Tracking starts this week — check back next week" : `${points.length} weeks tracked`}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex gap-4 text-xs text-ink-secondary">
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

function StackedBar({ metrics }: { metrics: { total: number; completed: number; inProgress: number; notStarted: number } }) {
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

function SectionHeading({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-ink-primary">{children}</h2>
      <div className="h-[3px] w-7 rounded-full mt-1.5" style={{ background: "var(--series-1)" }} />
      {hint && <p className="text-xs text-ink-muted mt-2">{hint}</p>}
    </div>
  );
}

/** One POD or PO row: summary + trend, expandable to show every nested PO/client with their own counts. */
function GroupCard({
  metrics,
  nested,
  nestedLabel,
  displayName,
  expanded,
  onToggle,
}: {
  metrics: PodMetrics;
  nested: Breakdown[];
  nestedLabel: string;
  displayName?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const name = displayName ?? metrics.pod;
  const color = trendColor(metrics.wowCompletionChange);
  return (
    <div className="py-3.5 border-b border-hairline last:border-b-0">
      <button className="w-full text-left" onClick={onToggle}>
        <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
          <span className="text-sm font-medium text-ink-primary">
            {name}
            <span className="text-ink-muted font-normal">
              {" "}
              · {nested.length} {nestedLabel.toLowerCase()}
              {nested.length === 1 ? "" : "s"}
            </span>
          </span>
          <span className="text-xs text-ink-muted tabular-nums flex items-center gap-2.5 shrink-0">
            {metrics.total} tasks
            <Sparkline points={metrics.trend.map((t) => t.pctCompleted)} color={color} width={50} height={18} />
            <span className={`inline-block text-ink-muted transition-transform ${expanded ? "rotate-180" : ""}`}>▾</span>
          </span>
        </div>
        <StackedBar metrics={metrics} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-ink-secondary tabular-nums">
          <span>
            Done {metrics.completed} ({metrics.pctCompleted}%)
          </span>
          <span>
            In progress {metrics.inProgress} ({metrics.pctInProgress}%)
          </span>
          <span>
            Not started {metrics.notStarted} ({metrics.pctNotStarted}%)
          </span>
          <Delta value={metrics.wowCompletionChange} />
        </div>
      </button>

      {expanded && (
        <div className="mt-3 ml-1 pl-3 border-l-2 border-hairline space-y-3">
          {nested.length === 0 && <p className="text-xs text-ink-muted">No {nestedLabel.toLowerCase()} attached to these tasks.</p>}
          {nested.map((n) => (
            <div key={n.name} className="text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-ink-primary font-medium">{n.name}</span>
                <span className="text-ink-muted tabular-nums">{n.total} tasks</span>
              </div>
              <StackedBar metrics={n} />
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-ink-muted tabular-nums">
                <span>
                  Done {n.completed} ({n.pctCompleted}%)
                </span>
                <span>
                  In progress {n.inProgress} ({n.pctInProgress}%)
                </span>
                <span>
                  Not started {n.notStarted} ({n.pctNotStarted}%)
                </span>
              </div>
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
      <header className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: "linear-gradient(120deg, #131417 0%, #2a78d6 140%)" }} />
        <div className="relative max-w-5xl mx-auto px-6 py-7 flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3.5">
            <img src={LOGO_SRC} alt="Logo" className="w-11 h-11 rounded-lg shadow-md shrink-0" />
            <div>
              <h1 className="text-2xl font-semibold text-white tracking-tight">POD Task Dashboard</h1>
              <p className="text-sm text-white/70 mt-1">
                Live status of client tasks, grouped by POD and PO. Source: Client_Task Tracker (Notion).
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => generate("csv")}
              disabled={!report || generating !== null}
              className="border border-white/30 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-white/10 transition-colors"
            >
              {generating === "csv" ? "Generating…" : "Download CSV"}
            </button>
            <button
              onClick={() => generate("pdf")}
              disabled={!report || generating !== null}
              className="bg-white text-ink-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity shadow-sm"
            >
              {generating === "pdf" ? "Generating…" : "Generate Report (PDF)"}
            </button>
          </div>
        </div>
      </header>

      {report && (
        <div className="sticky top-0 z-20 bg-surface/95 backdrop-blur border-b border-hairline">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
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
            <div className="flex items-center gap-4 flex-wrap">
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
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 py-8">
        {error && (
          <div className="bg-surface border border-status-critical/30 text-status-critical rounded-lg p-4 mb-6 text-sm">
            {error}
          </div>
        )}

        {report && (
          <>
            <p className="text-xs text-ink-muted mb-6 max-w-2xl">
              <strong className="text-ink-secondary">"vs last week"</strong> compares this week's numbers to a snapshot
              saved the last time someone clicked Generate Report.
              {!report.hasPriorSnapshot && " No snapshot exists yet for these groups — the trend cards below will fill in from next week's report."}
              {" "}Expand any POD or PO card below to see who's underneath it.
            </p>

            <div className="flex gap-4 mb-4 flex-wrap">
              <StatCard label="Total tasks" value={`${report.overall.total}`} />
              <StatCard
                label="Completed"
                value={`${report.overall.completed}`}
                valueClass="text-status-good"
                sub={`${report.overall.pctCompleted}% of ${report.overall.total}`}
                accent="var(--status-good)"
              />
              <StatCard
                label="In progress"
                value={`${report.overall.inProgress}`}
                valueClass="text-series-1"
                sub={`${report.overall.pctInProgress}% of ${report.overall.total}`}
                accent="var(--series-1)"
              />
              <StatCard
                label="Not started"
                value={`${report.overall.notStarted}`}
                sub={`${report.overall.pctNotStarted}% of ${report.overall.total}`}
                accent="var(--text-muted)"
              />
            </div>

            <div className="flex gap-4 mb-6 flex-wrap">
              <TrendStatCard
                label="Completion vs last week"
                value={
                  report.overall.wowCompletionChange === null
                    ? "n/a"
                    : `${report.overall.wowCompletionChange >= 0 ? "+" : ""}${report.overall.wowCompletionChange.toFixed(1)} pts`
                }
                valueClass={report.overall.wowCompletionChange === null ? "text-ink-muted" : report.overall.wowCompletionChange >= 0 ? "text-status-good" : "text-status-critical"}
                points={report.overall.trend.map((t) => t.pctCompleted)}
                color={trendColor(report.overall.wowCompletionChange)}
              />
              <TrendStatCard
                label="Net task change (completed minus new)"
                value={
                  report.overall.netTaskChange === null
                    ? "n/a"
                    : `${report.overall.netTaskChange >= 0 ? "+" : ""}${report.overall.netTaskChange} tasks`
                }
                valueClass={
                  report.overall.netTaskChange === null
                    ? "text-ink-muted"
                    : report.overall.netTaskChange >= 0
                    ? "text-status-good"
                    : "text-status-critical"
                }
                points={report.overall.trend.map((t) => t.completed)}
                color={
                  report.overall.netTaskChange === null
                    ? "var(--text-muted)"
                    : report.overall.netTaskChange >= 0
                    ? "var(--status-good)"
                    : "var(--status-critical)"
                }
              />
            </div>

            <div className="bg-surface border border-hairline rounded-xl p-6 shadow-sm">
              {view === "pod" ? (
                <>
                  <SectionHeading hint="Every PO with tasks under a POD shows up when you expand it.">By POD</SectionHeading>
                  {report.byPod.length === 0 && <p className="text-sm text-ink-muted">No tasks found for this week.</p>}
                  {report.byPod.map((p) => (
                    <GroupCard
                      key={p.pod}
                      metrics={p}
                      nested={p.pos}
                      nestedLabel="PO"
                      expanded={expandedGroups.has(p.pod)}
                      onToggle={() => toggleGroup(p.pod)}
                    />
                  ))}
                </>
              ) : (
                <>
                  <SectionHeading hint="Click a PO to see which clients their tasks belong to.">By PO</SectionHeading>
                  {report.byPo.length === 0 && <p className="text-sm text-ink-muted">No tasks found for this week.</p>}
                  {report.byPo.map((p) => (
                    <GroupCard
                      key={p.pod}
                      metrics={p}
                      nested={p.clients}
                      nestedLabel="Client"
                      displayName={p.pod.replace(/^PO - /, "")}
                      expanded={expandedGroups.has(p.pod)}
                      onToggle={() => toggleGroup(p.pod)}
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
