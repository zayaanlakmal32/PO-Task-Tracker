import type { ClientBreakdown, PodMetrics, PoMetrics, TaskRow, WeeklyReport } from "./types";
import { fetchLatestSnapshot } from "./notion";
import { isWithinWeek } from "./week";

const ALL_PODS_LABEL = "All PODs";
const WEEK_BASIS = (process.env.WEEK_BASIS ?? "due_date") as "due_date" | "created";

function pct(n: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((n / total) * 1000) / 10; // one decimal place
}

function summarize(groupName: string, tasks: TaskRow[], weekStart: string, weekEnd: string): Omit<PodMetrics, "wowCompletionChange" | "netTaskChange"> {
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

function summarizeClients(tasks: TaskRow[]): ClientBreakdown[] {
  const clients = Array.from(new Set(tasks.map((t) => t.client).filter((c): c is string => Boolean(c)))).sort();
  return clients
    .map((client) => {
      const clientTasks = tasks.filter((t) => t.client === client);
      const total = clientTasks.length;
      const completed = clientTasks.filter((t) => t.status === "Done").length;
      const inProgress = clientTasks.filter((t) => t.status === "In progress").length;
      const notStarted = clientTasks.filter((t) => t.status === "Not started" || !t.status).length;
      return { client, total, completed, inProgress, notStarted, pctCompleted: pct(completed, total) };
    })
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

async function withDelta(base: Omit<PodMetrics, "wowCompletionChange" | "netTaskChange">, weekStart: string): Promise<PodMetrics> {
  const prior = await fetchLatestSnapshot(base.pod, weekStart);
  if (!prior) {
    return { ...base, wowCompletionChange: null, netTaskChange: null };
  }
  const wowCompletionChange = Math.round((base.pctCompleted - prior.pctCompleted) * 10) / 10;
  const netTaskChange = base.completed - base.newThisWeek;
  return { ...base, wowCompletionChange, netTaskChange };
}

export async function buildWeeklyReport(allTasks: TaskRow[], weekStart: string, weekEnd: string): Promise<WeeklyReport> {
  const weekTasks = tasksForWeek(allTasks, weekStart, weekEnd);

  const pods = Array.from(new Set(weekTasks.map((t) => t.pod).filter((p): p is string => Boolean(p)))).sort();
  const pos = Array.from(new Set(weekTasks.map((t) => t.po).filter((p): p is string => Boolean(p)))).sort();

  const overallBase = summarize(ALL_PODS_LABEL, weekTasks, weekStart, weekEnd);
  const overall = await withDelta(overallBase, weekStart);

  const byPod: PodMetrics[] = [];
  for (const pod of pods) {
    const base = summarize(pod, weekTasks.filter((t) => t.pod === pod), weekStart, weekEnd);
    byPod.push(await withDelta(base, weekStart));
  }

  const byPo: PoMetrics[] = [];
  for (const po of pos) {
    const poTasks = weekTasks.filter((t) => t.po === po);
    // Prefixed distinctly from POD archive rows ("POD - X") so WoW history never collides between the two groupings.
    const base = summarize(`PO - ${po}`, poTasks, weekStart, weekEnd);
    const withWow = await withDelta(base, weekStart);
    byPo.push({ ...withWow, clients: summarizeClients(poTasks) });
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
