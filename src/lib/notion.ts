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

function plainTitle(prop: any): string {
  if (!prop || prop.type !== "title") return "";
  return (prop.title ?? []).map((t: any) => t.plain_text ?? "").join("");
}

function firstRelationId(prop: any): string | null {
  if (!prop || prop.type !== "relation" || !Array.isArray(prop.relation)) return null;
  return prop.relation[0]?.id ?? null;
}

function pageToTaskRow(page: any): TaskRow & { clientId: string | null } {
  const props = page.properties ?? {};
  const statusName = props.Status?.status?.name ?? null;
  const dueDate = props["Due date"]?.date?.start ?? null;
  return {
    id: page.id,
    title: plainTitle(props["Client Tasks"]) || "(untitled task)",
    status: (statusName as TaskRow["status"]) ?? null,
    dueDate,
    createdTime: page.created_time,
    pod: null, // resolved afterwards from the Project Tracker roster, not the Pod rollup
    po: null, // resolved afterwards from the Project Tracker roster, not the PO rollup
    client: null, // resolved afterwards, once the roster is fetched
    clientId: firstRelationId(props["Project Tracker Client"]),
  };
}

/**
 * Maps every Project Tracker page ID -> its Client Name / PO Name / POD, read straight off
 * that database's own columns.
 *
 * Earlier versions of this app read a task's PO/Pod off rollup properties on the Client_Task
 * Tracker side. Those rollups turned out to be unreliable - for a meaningful chunk of clients
 * they simply never resolved, so those clients' tasks silently had no PO or POD at all and
 * their whole PO could vanish from every report. Reading PO Name / POD directly from the
 * Project Tracker row a task is linked to (via "Project Tracker Client") is the same data,
 * straight from its source, with nothing in between that can fail to compute.
 */
async function fetchProjectRoster(): Promise<Record<string, { client: string; po: string | null; pod: string | null }>> {
  const dataSourceId = requireEnv("NOTION_PROJECT_DATA_SOURCE_ID");
  const map: Record<string, { client: string; po: string | null; pod: string | null }> = {};
  let cursor: string | undefined;
  do {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await notionRequest(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    for (const page of res.results ?? []) {
      const name = plainTitle(page.properties?.["Client Name"]);
      if (!name) continue;
      map[page.id] = {
        client: name,
        po: page.properties?.["PO Name"]?.select?.name ?? null,
        pod: page.properties?.["POD"]?.select?.name ?? null,
      };
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return map;
}

/** Fetch every row from the Client_Task Tracker data source, fully paginated, with client/PO/POD resolved. */
export async function fetchAllTasks(): Promise<TaskRow[]> {
  const dataSourceId = requireEnv("NOTION_TASK_DATA_SOURCE_ID");
  const rows: (TaskRow & { clientId: string | null })[] = [];
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

  const roster = await fetchProjectRoster();
  return rows.map(({ clientId, ...row }) => {
    const info = clientId ? roster[clientId] : undefined;
    return {
      ...row,
      client: info?.client ?? null,
      po: info?.po ?? null,
      pod: info?.pod ?? null,
    };
  });
}

/**
 * Look up up to `limit` archived snapshots for a given pod, strictly before a given week,
 * returned oldest -> newest (chronological), ready to feed straight into a trend sparkline.
 * The most recent entry (last in the array) doubles as the "prior week" for WoW deltas.
 */
export async function fetchRecentSnapshots(pod: string, beforeWeekStart: string, limit = 6): Promise<ArchiveSnapshot[]> {
  const dataSourceId = process.env.NOTION_ARCHIVE_DATA_SOURCE_ID;
  if (!dataSourceId) return [];

  const res = await notionRequest(`/data_sources/${dataSourceId}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: limit,
      filter: {
        and: [
          { property: "Pod", select: { equals: pod } },
          { property: "Week Start", date: { before: beforeWeekStart } },
        ],
      },
      sorts: [{ property: "Week Start", direction: "descending" }],
    }),
  });

  const rows: ArchiveSnapshot[] = (res.results ?? []).map((page: any) => {
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
  });
  return rows.reverse();
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
