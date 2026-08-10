import type { PodMetrics, TaskRow, WeeklyReport } from "./types";
import { fetchLatestSnapshot } from "./notion";
import { isWithinWeek } from "./week";

const ALL_PODS_LABEL = "All PODs";
const WEEK_BASIS = (process.env.WEEK_BASIS ?? "due_date") as "due_date" | "created";

function pct(n: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((n / total) * 1000) / 10; // one decimal place
}

function summarize(pod: string, tasks: TaskRow[], weekStart: string, weekEnd: string): Omit<PodMetrics, "wowCompletionChange" | "netTaskChange"> {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "Done").length;
  const inProgress = tasks.filter((t) => t.status === "In progress").length;
  const notStarted = tasks.filter((t) => t.status === "Not started" || !t.status).length;
  const newThisWeek = tasks.filter((t) => isWithinWeek(t.createdTime, weekStart, weekEnd)).length;

  return {
    pod,
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

  const overallBase = summarize(ALL_PODS_LABEL, weekTasks, weekStart, weekEnd);
  const overall = await withDelta(overallBase, weekStart);

  const byPod: PodMetrics[] = [];
  for (const pod of pods) {
    const base = summarize(pod, weekTasks.filter((t) => t.pod === pod), weekStart, weekEnd);
    byPod.push(await withDelta(base, weekStart));
  }

  return {
    weekStart,
    weekEnd,
    generatedAt: new Date().toISOString(),
    overall,
    byPod,
    hasPriorSnapshot: overall.wowCompletionChange !== null,
  };
}

export { ALL_PODS_LABEL };
