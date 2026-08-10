import type { Breakdown, PodDetail, PodMetrics, PoDetail, TaskRow, TrendPoint, WeeklyReport } from "./types";
import { fetchRecentSnapshots } from "./notion";
import { isWithinWeek } from "./week";

const ALL_PODS_LABEL = "All PODs";
const WEEK_BASIS = (process.env.WEEK_BASIS ?? "due_date") as "due_date" | "created";
const TREND_WEEKS = 6; // how many prior archived weeks to pull for sparklines

function pct(n: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((n / total) * 1000) / 10; // one decimal place
}

function summarize(
  groupName: string,
  tasks: TaskRow[],
  weekStart: string,
  weekEnd: string
): Omit<PodMetrics, "wowCompletionChange" | "netTaskChange" | "trend"> {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "Done").length;
  const inProgress = tasks.filter((t) => t.status === "In progress").length;
  const notStarted = tasks.filter((t) => t.status === "Not started" || !t.status).length;
  const newThisWeek = tasks.filter((t) => isWithinWeek(t.createdTime, weekStart, weekEnd)).length;

  return {
    pod: groupName,
    total,
    completed,
    inProgress,
    notStarted,
    newThisWeek,
    pctCompleted: pct(completed, total),
    pctInProgress: pct(inProgress, total),
    pctNotStarted: pct(notStarted, total),
  };
}

function summarizeBreakdown(name: string, tasks: TaskRow[]): Breakdown {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "Done").length;
  const inProgress = tasks.filter((t) => t.status === "In progress").length;
  const notStarted = tasks.filter((t) => t.status === "Not started" || !t.status).length;
  return {
    name,
    total,
    completed,
    inProgress,
    notStarted,
    pctCompleted: pct(completed, total),
    pctInProgress: pct(inProgress, total),
    pctNotStarted: pct(notStarted, total),
  };
}

/** Group tasks by `po` or `client` into per-name breakdowns, sorted by task count descending. Nothing is dropped. */
function groupBreakdown(tasks: TaskRow[], key: "po" | "client"): Breakdown[] {
  const names = Array.from(new Set(tasks.map((t) => t[key]).filter((v): v is string => Boolean(v)))).sort();
  return names
    .map((name) => summarizeBreakdown(name, tasks.filter((t) => t[key] === name)))
    .sort((a, b) => b.total - a.total);
}

/** Which tasks belong to the given week, per WEEK_BASIS. */
function tasksForWeek(tasks: TaskRow[], weekStart: string, weekEnd: string): TaskRow[] {
  return tasks.filter((t) => {
    const anchor = WEEK_BASIS === "created" ? t.createdTime : t.dueDate;
    if (!anchor) return false;
    return isWithinWeek(anchor, weekStart, weekEnd);
  });
}

async function withDelta(
  base: Omit<PodMetrics, "wowCompletionChange" | "netTaskChange" | "trend">,
  weekStart: string
): Promise<PodMetrics> {
  const history = await fetchRecentSnapshots(base.pod, weekStart, TREND_WEEKS);
  const prior = history.length > 0 ? history[history.length - 1] : null;

  const wowCompletionChange = prior ? Math.round((base.pctCompleted - prior.pctCompleted) * 10) / 10 : null;
  const netTaskChange = prior ? base.completed - base.newThisWeek : null;

  const trend: TrendPoint[] = [
    ...history.map((h) => ({ weekStart: h.weekStart, total: h.total, completed: h.completed, pctCompleted: h.pctCompleted })),
    { weekStart, total: base.total, completed: base.completed, pctCompleted: base.pctCompleted },
  ];

  return { ...base, wowCompletionChange, netTaskChange, trend };
}

export async function buildWeeklyReport(allTasks: TaskRow[], weekStart: string, weekEnd: string): Promise<WeeklyReport> {
  const weekTasks = tasksForWeek(allTasks, weekStart, weekEnd);

  const pods = Array.from(new Set(weekTasks.map((t) => t.pod).filter((p): p is string => Boolean(p)))).sort();
  const pos = Array.from(new Set(weekTasks.map((t) => t.po).filter((p): p is string => Boolean(p)))).sort();

  const overallBase = summarize(ALL_PODS_LABEL, weekTasks, weekStart, weekEnd);
  const overall = await withDelta(overallBase, weekStart);

  const byPod: PodDetail[] = [];
  for (const pod of pods) {
    const podTasks = weekTasks.filter((t) => t.pod === pod);
    const base = summarize(pod, podTasks, weekStart, weekEnd);
    const withWow = await withDelta(base, weekStart);
    // Every PO with at least one task under this POD this week, so nothing gets hidden.
    byPod.push({ ...withWow, pos: groupBreakdown(podTasks, "po") });
  }

  const byPo: PoDetail[] = [];
  for (const po of pos) {
    const poTasks = weekTasks.filter((t) => t.po === po);
    // Prefixed distinctly from POD archive rows ("POD - X") so WoW history never collides between the two groupings.
    const base = summarize(`PO - ${po}`, poTasks, weekStart, weekEnd);
    const withWow = await withDelta(base, weekStart);
    byPo.push({ ...withWow, clients: groupBreakdown(poTasks, "client") });
  }
  byPo.sort((a, b) => b.total - a.total);

  return {
    weekStart,
    weekEnd,
    generatedAt: new Date().toISOString(),
    overall,
    byPod,
    byPo,
    hasPriorSnapshot: overall.wowCompletionChange !== null,
  };
}

export { ALL_PODS_LABEL };
