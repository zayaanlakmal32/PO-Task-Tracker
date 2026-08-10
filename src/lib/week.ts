// Week boundary helpers. Weeks run Monday 00:00 -> Sunday 23:59:59 in the
// configured local timezone (default Asia/Colombo, UTC+5:30), because that's
// where the team is and "this week" should match their calendar, not UTC's.

const TZ_OFFSET_MINUTES = Number(process.env.TZ_OFFSET_MINUTES ?? 330); // +5:30 default

function toLocal(date: Date): Date {
  return new Date(date.getTime() + TZ_OFFSET_MINUTES * 60_000);
}

function toUtcFromLocal(localDate: Date): Date {
  return new Date(localDate.getTime() - TZ_OFFSET_MINUTES * 60_000);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Given any date (defaults to now), return the Monday..Sunday window it falls in, as ISO date strings. */
export function weekWindowFor(reference: Date = new Date()): { weekStart: string; weekEnd: string } {
  const local = toLocal(reference);
  const day = local.getUTCDay(); // 0 = Sunday .. 6 = Saturday, in the shifted "local" clock
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const localMonday = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + diffToMonday)
  );
  const localSunday = new Date(localMonday.getTime() + 6 * 86_400_000);
  return { weekStart: ymd(localMonday), weekEnd: ymd(localSunday) };
}

/** ISO date string (YYYY-MM-DD) -> the same week window, shifted by `deltaWeeks`. */
export function shiftWeek(weekStartIso: string, deltaWeeks: number): { weekStart: string; weekEnd: string } {
  const [y, m, d] = weekStartIso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d + deltaWeeks * 7));
  return weekWindowFor(toUtcFromLocal(base));
}

/** Is the given ISO date (YYYY-MM-DD, or full datetime) within [weekStart, weekEnd] inclusive? */
export function isWithinWeek(isoDateOrDateTime: string, weekStart: string, weekEnd: string): boolean {
  const day = isoDateOrDateTime.slice(0, 10);
  return day >= weekStart && day <= weekEnd;
}

export function formatWeekLabel(weekStart: string, weekEnd: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const start = new Date(`${weekStart}T00:00:00Z`).toLocaleDateString("en-US", opts);
  const end = new Date(`${weekEnd}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${start} – ${end}`;
}
