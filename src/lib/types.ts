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
  netTaskChange: number | null; // completed - newThisWeek, null if no prior snapshot context needed (always computable actually)
}

export interface ClientBreakdown {
  client: string;
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  pctCompleted: number;
}

export interface PoMetrics extends PodMetrics {
  clients: ClientBreakdown[]; // which clients this PO's tasks belong to, and their status split
}

export interface WeeklyReport {
  weekStart: string; // ISO date, Monday
  weekEnd: string; // ISO date, Sunday
  generatedAt: string; // ISO datetime
  overall: PodMetrics;
  byPod: PodMetrics[];
  byPo: PoMetrics[];
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
