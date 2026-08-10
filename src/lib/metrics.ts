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
