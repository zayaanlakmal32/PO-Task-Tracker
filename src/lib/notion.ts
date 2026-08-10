import type { TaskRow, ArchiveSnapshot } from "./types";

const NOTION_VERSION = "2025-09-03";
const API_BASE = "https://api.notion.com/v1";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}. See .env.example.`);
  return v;
}

async function notionRequest(path: string, init: RequestInit = {}): Promise<any> {
  const token = requireEnv("NOTION_TOKEN");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API ${res.status} on ${path}: ${body}`);
  }
  return res.json();
}

function rollupNames(prop: any): string[] {
  if (!prop || prop.type !== "rollup" || !prop.rollup) return [];
  const rollup = prop.rollup;
  if (rollup.type === "array") {
    return rollup.array
      .map((item: any) => item?.select?.name ?? item?.status?.name ?? null)
      .filter((x: string | null): x is string => Boolean(x));
  }
  return [];
}

function plainTitle(prop: any): string {
  if (!prop || prop.type !== "title") return "";
  return (prop.title ?? []).map((t: any) => t.plain_text ?? "").join("");
}

function pageToTaskRow(page: any): TaskRow {
  const props = page.properties ?? {};
  const statusName = props.Status?.status?.name ?? null;
  const dueDate = props["Due date"]?.date?.start ?? null;
  const pods = rollupNames(props.Pod);
  const pos = rollupNames(props.PO);
  return {
    id: page.id,
    title: plainTitle(props["Client Tasks"]) || "(untitled task)",
    status: (statusName as TaskRow["status"]) ?? null,
    dueDate,
    createdTime: page.created_time,
    pod: pods[0] ?? null,
    po: pos[0] ?? null,
  };
}

/** Fetch every row from the Client_Task Tracker data source, fully paginated. */
export async function fetchAllTasks(): Promise<TaskRow[]> {
  const dataSourceId = requireEnv("NOTION_TASK_DATA_SOURCE_ID");
  const rows: TaskRow[] = [];
  let cursor: string | undefined;
  do {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await notionRequest(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    for (const page of res.results ?? []) rows.push(pageToTaskRow(page));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return rows;
}

/** Look up the most recent archived snapshot for a given pod at or before a given week. */
export async function fetchLatestSnapshot(pod: string, beforeWeekStart: string): Promise<ArchiveSnapshot | null> {
  const dataSourceId = process.env.NOTION_ARCHIVE_DATA_SOURCE_ID;
  if (!dataSourceId) return null;

  const res = await notionRequest(`/data_sources/${dataSourceId}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: 5,
      filter: {
        and: [
          { property: "Pod", select: { equals: pod } },
          { property: "Week Start", date: { before: beforeWeekStart } },
        ],
      },
      sorts: [{ property: "Week Start", direction: "descending" }],
    }),
  });

  const page = res.results?.[0];
  if (!page) return null;
  const props = page.properties;
  return {
    pod,
    weekStart: props["Week Start"]?.date?.start ?? "",
    total: props["Total Tasks"]?.number ?? 0,
    completed: props["Completed"]?.number ?? 0,
    inProgress: props["In Progress"]?.number ?? 0,
    notStarted: props["Not Started"]?.number ?? 0,
    newThisWeek: props["New Tasks This Week"]?.number ?? 0,
    pctCompleted: props["Pct Completed"]?.number ?? 0,
  };
}

/** Write (or overwrite) this week's snapshot row for a pod into the archive database. */
export async function upsertSnapshot(snapshot: {
  pod: string;
  weekStart: string;
  weekEnd: string;
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  newThisWeek: number;
  pctCompleted: number;
  pctInProgress: number;
  pctNotStarted: number;
  wowCompletionChange: number | null;
  netTaskChange: number | null;
}): Promise<void> {
  const dataSourceId = process.env.NOTION_ARCHIVE_DATA_SOURCE_ID;
  if (!dataSourceId) return; // archive not set up yet; silently skip so the report can still generate

  // Check for an existing row this week for this pod so re-generating the same week updates in place.
  const existing = await notionRequest(`/data_sources/${dataSourceId}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: 1,
      filter: {
        and: [
          { property: "Pod", select: { equals: snapshot.pod } },
          { property: "Week Start", date: { equals: snapshot.weekStart } },
        ],
      },
    }),
  });

  const properties = {
    Name: { title: [{ text: { content: `${snapshot.weekStart} · ${snapshot.pod}` } }] },
    "Week Start": { date: { start: snapshot.weekStart } },
    "Week End": { date: { start: snapshot.weekEnd } },
    Pod: { select: { name: snapshot.pod } },
    "Total Tasks": { number: snapshot.total },
    Completed: { number: snapshot.completed },
    "In Progress": { number: snapshot.inProgress },
    "Not Started": { number: snapshot.notStarted },
    "New Tasks This Week": { number: snapshot.newThisWeek },
    "Pct Completed": { number: snapshot.pctCompleted },
    "Pct In Progress": { number: snapshot.pctInProgress },
    "Pct Not Started": { number: snapshot.pctNotStarted },
    "WoW Completion Change": snapshot.wowCompletionChange === null ? undefined : { number: snapshot.wowCompletionChange },
    "Net Task Change": snapshot.netTaskChange === null ? undefined : { number: snapshot.netTaskChange },
    "Generated At": { date: { start: new Date().toISOString() } },
  };

  const existingPage = existing.results?.[0];
  if (existingPage) {
    await notionRequest(`/pages/${existingPage.id}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
  } else {
    await notionRequest(`/pages`, {
      method: "POST",
      body: JSON.stringify({
        parent: { data_source_id: dataSourceId },
        properties,
      }),
    });
  }
}
