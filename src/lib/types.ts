export type StatusName = "Not started" | "In progress" | "Done";

export interface TaskRow {
  id: string;
  title: string;
  status: StatusName | null;
  dueDate: string | null; // ISO date
  createdTime: string; // ISO datetime
  pod: string | null; // e.g. "POD - Eshan"
  po: string | null; // e.g. "Sayuni" (the person)
  client: string | null; // the client's name, resolved from the Project Tracker relation
}

/** A generic status breakdown for a named sub-group (a PO within a POD, or a client within a PO). */
export interface Breakdown {
  name: string;
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  pctCompleted: number;
  pctInProgress: number;
  pctNotStarted: number;
}

/** One archived week's completion snapshot, used to draw trend sparklines. */
export interface TrendPoint {
  weekStart: string;
  total: number;
  completed: number;
  pctCompleted: number;
}

export interface PodMetrics {
  pod: string; // "POD - Eshan", "PO - Sayuni", or "All PODs"
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  newThisWeek: number;
  pctCompleted: number;
  pctInProgress: number;
  pctNotStarted: number;
  wowCompletionChange: number | null; // percentage points vs previous week, null if no prior snapshot
  netTaskChange: number | null; // completed - newThisWeek, null if no prior snapshot
  trend: TrendPoint[]; // chronological ascending, up to the last 6 archived weeks plus this week
}

export interface PodDetail extends PodMetrics {
  pos: Breakdown[]; // every PO with tasks under this POD this week
}

export interface PoDetail extends PodMetrics {
  clients: Breakdown[]; // every client this PO's tasks belong to this week
}

export interface WeeklyReport {
  weekStart: string; // ISO date, Monday
  weekEnd: string; // ISO date, Sunday
  generatedAt: string; // ISO datetime
  overall: PodMetrics;
  byPod: PodDetail[];
  byPo: PoDetail[];
  hasPriorSnapshot: boolean;
}

export interface ArchiveSnapshot {
  pod: string;
  weekStart: string;
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  newThisWeek: number;
  pctCompleted: number;
}
