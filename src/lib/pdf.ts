import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { WeeklyReport } from "./types";
import { formatWeekLabel } from "./week";

const INK = rgb(0.043, 0.043, 0.043);
const MUTED = rgb(0.537, 0.529, 0.506);
const GOOD = rgb(0.047, 0.639, 0.047);
const CRITICAL = rgb(0.816, 0.231, 0.231);
const HAIRLINE = rgb(0.882, 0.878, 0.851);

function deltaColor(v: number | null) {
  if (v === null) return MUTED;
  return v >= 0 ? GOOD : CRITICAL;
}

function deltaText(v: number | null): string {
  if (v === null) return "n/a (first report)";
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}${Math.abs(v).toFixed(1)} pts vs last week`;
}

export async function renderReportPdf(report: WeeklyReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const left = 50;
  const right = 545;

  const draw = (text: string, opts: { x?: number; size?: number; f?: typeof font; color?: any } = {}) => {
    page.drawText(text, {
      x: opts.x ?? left,
      y,
      size: opts.size ?? 11,
      font: opts.f ?? font,
      color: opts.color ?? INK,
    });
  };

  draw("Weekly POD Task Report", { size: 20, f: bold });
  y -= 22;
  draw(formatWeekLabel(report.weekStart, report.weekEnd), { size: 12, color: MUTED });
  y -= 14;
  draw(`Generated ${new Date(report.generatedAt).toLocaleString("en-US")}`, { size: 9, color: MUTED });
  y -= 28;

  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: HAIRLINE });
  y -= 26;

  draw("Overall", { size: 14, f: bold });
  y -= 20;

  const stat = (label: string, value: string) => {
    draw(label, { size: 9, color: MUTED });
    y -= 13;
    draw(value, { size: 16, f: bold });
    y -= 18;
  };

  const o = report.overall;
  stat("Total tasks this week", `${o.total}`);
  stat("Completed", `${o.completed} (${o.pctCompleted}%)`);
  stat("In progress", `${o.inProgress} (${o.pctInProgress}%)`);
  stat("Not started", `${o.notStarted} (${o.pctNotStarted}%)`);

  draw("Week-over-week completion change", { size: 9, color: MUTED });
  y -= 13;
  draw(deltaText(o.wowCompletionChange), { size: 12, f: bold, color: deltaColor(o.wowCompletionChange) });
  y -= 18;

  draw("Net task change (completed - new)", { size: 9, color: MUTED });
  y -= 13;
  const net = o.netTaskChange;
  draw(net === null ? "n/a (first report)" : `${net >= 0 ? "+" : ""}${net}`, {
    size: 12,
    f: bold,
    color: net === null ? MUTED : net >= 0 ? GOOD : CRITICAL,
  });
  y -= 26;

  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: HAIRLINE });
  y -= 24;

  draw("By POD", { size: 14, f: bold });
  y -= 18;

  const cols = [left, 190, 260, 330, 400, 470];
  const headers = ["POD", "Total", "Done %", "In Prog %", "Not Started %", "WoW"];
  headers.forEach((h, i) => page.drawText(h, { x: cols[i], y, size: 9, font: bold, color: MUTED }));
  y -= 16;

  for (const p of report.byPod) {
    if (y < 80) break; // simple single-page guard
    const row = [
      p.pod,
      `${p.total}`,
      `${p.pctCompleted}%`,
      `${p.pctInProgress}%`,
      `${p.pctNotStarted}%`,
      p.wowCompletionChange === null ? "n/a" : `${p.wowCompletionChange >= 0 ? "+" : ""}${p.wowCompletionChange.toFixed(1)}`,
    ];
    row.forEach((cell, i) => page.drawText(cell, { x: cols[i], y, size: 10, font, color: INK }));
    y -= 16;
  }

  y -= 10;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: HAIRLINE });
  y -= 16;
  page.drawText(
    "Tasks are bucketed into a week by their Due date. WoW = percentage-point change in completion rate vs the prior week's snapshot.",
    { x: left, y, size: 8, font, color: MUTED, maxWidth: right - left }
  );

  return doc.save();
}

export function renderReportCsv(report: WeeklyReport): string {
  const lines = [
    "Pod,Total Tasks,Completed,In Progress,Not Started,Pct Completed,Pct In Progress,Pct Not Started,WoW Completion Change (pts),Net Task Change",
  ];
  const rows = [report.overall, ...report.byPod];
  for (const p of rows) {
    lines.push(
      [
        p.pod,
        p.total,
        p.completed,
        p.inProgress,
        p.notStarted,
        p.pctCompleted,
        p.pctInProgress,
        p.pctNotStarted,
        p.wowCompletionChange ?? "",
        p.netTaskChange ?? "",
      ].join(",")
    );
  }
  return lines.join("\n");
}
