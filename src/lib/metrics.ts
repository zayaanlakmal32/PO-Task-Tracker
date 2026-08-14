import type { Breakdown, PodDetail, PodMetrics, PoDetail, TaskRow, TrendPoint, WeeklyReport } from "./types";
import { fetchRecentSnapshots } from "./notion";
import { isWithinWeek } from "./week";

const ALL_PODS_LABEL = "All PODs";
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

/**
 * Group tasks by `po` or `client` into per-name breakdowns, sorted by task count descending.
 *
 * `roster` is the full list of names that should always appear here - e.g. every PO that has
 * ever had a task under this POD, drawn from the whole tracker, not just this week. A name
 * with no tasks this week still gets a row (0 total, 0/0/0), instead of quietly vanishing
 * from the report just because nothing of theirs happens to be due this particular week.
 */
function groupBreakdown(tasks: TaskRow[], key: "po" | "client", roster: string[] = []): Breakdown[] {
  const namesFromTasks = tasks.map((t) => t[key]).filter((v): v is string => Boolean(v));
  const names = Array.from(new Set([...roster, ...namesFromTasks])).sort();
  return names
    .map((name) => summarizeBreakdown(name, tasks.filter((t) => t[key] === name)))
    .sort((a, b) => b.total - a.total);
}

/** Strictly the tasks due within this week's window - a task with no due date, or a due date outside it, isn't counted. */
function tasksForWeek(tasks: TaskRow[], weekStart: string, weekEnd: string): TaskRow[] {
  return tasks.filter((t) => Boolean(t.dueDate) && isWithinWeek(t.dueDate!, weekStart, weekEnd));
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

  // Roster = every POD/PO/client that has ever had a task in the tracker (all-time, not just
  // this week). Used so a POD or PO with nothing due this particular week still gets listed
  // with zero counts, instead of disappearing from the report entirely.
  const pods = Array.from(new Set(allTasks.map((t) => t.pod).filter((p): p is string => Boolean(p)))).sort();
  const pos = Array.from(new Set(allTasks.map((t) => t.po).filter((p): p is string => Boolean(p)))).sort();

  const overallBase = summarize(ALL_PODS_LABEL, weekTasks, weekStart, weekEnd);
  const overall = await withDelta(overallBase, weekStart);

  const byPod: PodDetail[] = [];
  for (const pod of pods) {
    const podTasksThisWeek = weekTasks.filter((t) => t.pod === pod);
    const posRosterForPod = Array.from(
      new Set(allTasks.filter((t) => t.pod === pod).map((t) => t.po).filter((p): p is string => Boolean(p)))
    ).sort();
    const base = summarize(pod, podTasksThisWeek, weekStart, weekEnd);
    const withWow = await withDelta(base, weekStart);
    byPod.push({ ...withWow, pos: groupBreakdown(podTasksThisWeek, "po", posRosterForPod) });
  }

  const byPo: PoDetail[] = [];
  for (const po of pos) {
    const poTasksThisWeek = weekTasks.filter((t) => t.po === po);
    const clientsRosterForPo = Array.from(
      new Set(allTasks.filter((t) => t.po === po).map((t) => t.client).filter((c): c is string => Boolean(c)))
    ).sort();
    // Prefixed distinctly from POD archive rows ("POD - X") so WoW history never collides between the two groupings.
    const base = summarize(`PO - ${po}`, poTasksThisWeek, weekStart, weekEnd);
    const withWow = await withDelta(base, weekStart);
    byPo.push({ ...withWow, clients: groupBreakdown(poTasksThisWeek, "client", clientsRosterForPo) });
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
