import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { PoMetrics, PodMetrics, WeeklyReport } from "./types";
import { formatWeekLabel } from "./week";

const INK = rgb(0.043, 0.043, 0.043);
const MUTED = rgb(0.537, 0.529, 0.506);
const FAINT = rgb(0.671, 0.663, 0.635);
const GOOD = rgb(0.047, 0.639, 0.047);
const CRITICAL = rgb(0.816, 0.231, 0.231);
const HAIRLINE = rgb(0.882, 0.878, 0.851);
const HEADER_BAND = rgb(0.914, 0.949, 0.988); // soft blue accent
const ACCENT = rgb(0.165, 0.471, 0.839); // series-1 blue
const TABLE_HEAD = rgb(0.953, 0.953, 0.945);
const ZEBRA = rgb(0.98, 0.98, 0.976);
const DONE_COLOR = GOOD;
const PROGRESS_COLOR = ACCENT;
const NOT_STARTED_COLOR = FAINT;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const LEFT = 50;
const RIGHT = 545;
const TOP_MARGIN = 780;
const BOTTOM_MARGIN = 60;

function deltaText(v: number | null): string {
  if (v === null) return "n/a (first report)";
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}${Math.abs(v).toFixed(1)} pts vs last week`;
}

function deltaColor(v: number | null) {
  if (v === null) return MUTED;
  return v >= 0 ? GOOD : CRITICAL;
}

function wowCell(v: number | null): string {
  return v === null ? "n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
}

class ReportCanvas {
  doc!: PDFDocument;
  page!: PDFPage;
  font!: PDFFont;
  bold!: PDFFont;
  y = TOP_MARGIN;
  weekLabel: string;

  constructor(weekLabel: string) {
    this.weekLabel = weekLabel;
  }

  static async create(weekLabel: string): Promise<ReportCanvas> {
    const c = new ReportCanvas(weekLabel);
    c.doc = await PDFDocument.create();
    c.font = await c.doc.embedFont(StandardFonts.Helvetica);
    c.bold = await c.doc.embedFont(StandardFonts.HelveticaBold);
    c.addPage();
    return c;
  }

  addPage() {
    if (this.page) this.drawFooter();
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = TOP_MARGIN;
  }

  drawFooter() {
    this.page.drawLine({ start: { x: LEFT, y: 40 }, end: { x: RIGHT, y: 40 }, thickness: 0.5, color: HAIRLINE });
    this.page.drawText(`POD Task Dashboard · ${this.weekLabel}`, { x: LEFT, y: 28, size: 8, font: this.font, color: FAINT });
    this.page.drawText(`Page ${this.doc.getPageCount()}`, { x: RIGHT - 40, y: 28, size: 8, font: this.font, color: FAINT });
  }

  ensureSpace(needed: number) {
    if (this.y - needed < BOTTOM_MARGIN) this.addPage();
  }

  text(str: string, opts: { x?: number; size?: number; bold?: boolean; color?: any } = {}) {
    this.page.drawText(str, {
      x: opts.x ?? LEFT,
      y: this.y,
      size: opts.size ?? 11,
      font: opts.bold ? this.bold : this.font,
      color: opts.color ?? INK,
    });
  }

  hr(color = HAIRLINE) {
    this.page.drawLine({ start: { x: LEFT, y: this.y }, end: { x: RIGHT, y: this.y }, thickness: 1, color });
  }

  sectionTitle(title: string) {
    this.ensureSpace(40);
    this.text(title, { size: 15, bold: true });
    this.y -= 8;
    this.page.drawRectangle({ x: LEFT, y: this.y - 2, width: 28, height: 3, color: ACCENT });
    this.y -= 20;
  }

  finish(): Promise<Uint8Array> {
    this.drawFooter();
    return this.doc.save();
  }
}

function statCard(c: ReportCanvas, x: number, width: number, label: string, value: string, valueColor: any, sub?: string, subColor?: any) {
  const top = c.y;
  const height = sub ? 62 : 48;
  c.page.drawRectangle({ x, y: top - height, width, height, borderColor: HAIRLINE, borderWidth: 1, color: rgb(1, 1, 1) });
  c.page.drawText(label, { x: x + 10, y: top - 16, size: 8, font: c.font, color: MUTED });
  c.page.drawText(value, { x: x + 10, y: top - 34, size: 17, font: c.bold, color: valueColor });
  if (sub) c.page.drawText(sub, { x: x + 10, y: top - 50, size: 7.5, font: c.font, color: subColor ?? MUTED });
}

function legend(c: ReportCanvas) {
  const items: [string, any][] = [
    ["Done", DONE_COLOR],
    ["In progress", PROGRESS_COLOR],
    ["Not started", NOT_STARTED_COLOR],
  ];
  let x = LEFT;
  for (const [label, color] of items) {
    c.page.drawRectangle({ x, y: c.y - 8, width: 8, height: 8, color });
    c.page.drawText(label, { x: x + 12, y: c.y - 7, size: 8.5, font: c.font, color: MUTED });
    x += c.font.widthOfTextAtSize(label, 8.5) + 34;
  }
  c.y -= 22;
}

function stackedBar(c: ReportCanvas, x: number, width: number, m: PodMetrics) {
  const total = m.total || 1;
  const h = 8;
  const doneW = (m.completed / total) * width;
  const progW = (m.inProgress / total) * width;
  const notW = width - doneW - progW;
  let cx = x;
  if (doneW > 0) {
    c.page.drawRectangle({ x: cx, y: c.y, width: doneW, height: h, color: DONE_COLOR });
    cx += doneW;
  }
  if (progW > 0) {
    c.page.drawRectangle({ x: cx, y: c.y, width: progW, height: h, color: PROGRESS_COLOR });
    cx += progW;
  }
  if (notW > 0) {
    c.page.drawRectangle({ x: cx, y: c.y, width: notW, height: h, color: NOT_STARTED_COLOR });
  }
  c.page.drawRectangle({ x, y: c.y, width, height: h, borderColor: HAIRLINE, borderWidth: 0.5 });
}

function groupTable(c: ReportCanvas, rows: PodMetrics[], headLabel: string) {
  const cols = [LEFT, 230, 300, 372, 452, 500];
  const headers = [headLabel, "Total", "Done %", "In Prog %", "Not Started", "vs Last Wk"];

  c.ensureSpace(28);
  c.page.drawRectangle({ x: LEFT, y: c.y - 20, width: RIGHT - LEFT, height: 22, color: TABLE_HEAD });
  headers.forEach((h, i) => c.page.drawText(h, { x: cols[i] + 4, y: c.y - 14, size: 8.5, font: c.bold, color: MUTED }));
  c.y -= 22;

  rows.forEach((r, idx) => {
    c.ensureSpace(24);
    if (idx % 2 === 1) c.page.drawRectangle({ x: LEFT, y: c.y - 18, width: RIGHT - LEFT, height: 20, color: ZEBRA });
    const cells = [
      r.pod,
      `${r.total}`,
      `${r.pctCompleted}%`,
      `${r.pctInProgress}%`,
      `${r.pctNotStarted}%`,
      wowCell(r.wowCompletionChange),
    ];
    cells.forEach((cell, i) => {
      const color = i === 5 ? deltaColor(r.wowCompletionChange) : INK;
      c.page.drawText(cell, { x: cols[i] + 4, y: c.y - 12, size: 9.5, font: c.font, color });
    });
    c.y -= 20;
  });
  c.hr();
  c.y -= 14;
}

export async function renderReportPdf(report: WeeklyReport): Promise<Uint8Array> {
  const weekLabel = formatWeekLabel(report.weekStart, report.weekEnd);
  const c = await ReportCanvas.create(weekLabel);

  // Header band
  c.page.drawRectangle({ x: 0, y: PAGE_H - 96, width: PAGE_W, height: 96, color: HEADER_BAND });
  c.page.drawText("Weekly POD Task Report", { x: LEFT, y: PAGE_H - 46, size: 21, font: c.bold, color: INK });
  c.page.drawText(weekLabel, { x: LEFT, y: PAGE_H - 66, size: 12, font: c.font, color: MUTED });
  c.page.drawText(`Generated ${new Date(report.generatedAt).toLocaleString("en-US")}`, {
    x: LEFT,
    y: PAGE_H - 82,
    size: 8.5,
    font: c.font,
    color: FAINT,
  });
  c.y = PAGE_H - 120;

  c.text(
    "\"vs Last Wk\" (week-over-week) compares this week's completion rate to last week's saved snapshot; it reads n/a until a second week of reports exists.",
    { size: 8, color: MUTED }
  );
  c.y -= 22;

  // Overall stat cards
  c.sectionTitle("Overall");
  const o = report.overall;
  const cardW = (RIGHT - LEFT - 3 * 10) / 4;
  statCard(c, LEFT, cardW, "TOTAL TASKS", `${o.total}`, INK);
  statCard(c, LEFT + (cardW + 10), cardW, "COMPLETED", `${o.pctCompleted}%`, DONE_COLOR, `${o.completed} tasks`);
  statCard(c, LEFT + 2 * (cardW + 10), cardW, "IN PROGRESS", `${o.pctInProgress}%`, PROGRESS_COLOR, `${o.inProgress} tasks`);
  statCard(c, LEFT + 3 * (cardW + 10), cardW, "NOT STARTED", `${o.pctNotStarted}%`, INK, `${o.notStarted} tasks`);
  c.y -= 70;

  const cardW2 = (RIGHT - LEFT - 10) / 2;
  statCard(c, LEFT, cardW2, "COMPLETION vs LAST WEEK", deltaText(o.wowCompletionChange), deltaColor(o.wowCompletionChange));
  const net = o.netTaskChange;
  statCard(
    c,
    LEFT + (cardW2 + 10),
    cardW2,
    "NET TASK CHANGE (completed minus new)",
    net === null ? "n/a (first report)" : `${net >= 0 ? "+" : ""}${net}`,
    net === null ? MUTED : net >= 0 ? GOOD : CRITICAL
  );
  c.y -= 78;

  legend(c);
  c.y -= 4;

  // By POD
  c.sectionTitle("By POD");
  groupTable(c, report.byPod, "POD");

  // By PO
  c.sectionTitle("By PO");
  c.text("Each PO's tasks, broken down by the clients they belong to.", { size: 8.5, color: MUTED });
  c.y -= 18;

  for (const po of report.byPo) {
    c.ensureSpace(46);
    c.text(po.pod.replace(/^PO - /, ""), { size: 11.5, bold: true });
    c.text(`${po.total} tasks`, { x: RIGHT - 60, size: 9, color: MUTED });
    c.y -= 12;
    stackedBar(c, LEFT, RIGHT - LEFT - 140, po);
    c.text(wowCell(po.wowCompletionChange) === "n/a" ? "vs last wk: n/a" : `vs last wk: ${wowCell(po.wowCompletionChange)} pts`, {
      x: RIGHT - 130,
      size: 8,
      color: deltaColor(po.wowCompletionChange),
    });
    c.y -= 16;
    c.text(`Done ${po.pctCompleted}% · In progress ${po.pctInProgress}% · Not started ${po.pctNotStarted}%`, {
      size: 8,
      color: MUTED,
    });
    c.y -= 16;

    if (po.clients.length > 0) {
      for (const cl of po.clients) {
        c.ensureSpace(16);
        c.text(`· ${cl.client}`, { x: LEFT + 10, size: 8.5, color: INK });
        c.text(
          `${cl.total} tasks — Done ${cl.pctCompleted}%, In progress ${pctOf(cl.inProgress, cl.total)}%, Not started ${pctOf(cl.notStarted, cl.total)}%`,
          { x: LEFT + 150, size: 8, color: MUTED }
        );
        c.y -= 13;
      }
    } else {
      c.text("No client attached to these tasks.", { x: LEFT + 10, size: 8, color: FAINT });
      c.y -= 13;
    }
    c.y -= 10;
    c.hr();
    c.y -= 16;
  }

  return c.finish();
}

function pctOf(n: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((n / total) * 1000) / 10;
}

export function renderReportCsv(report: WeeklyReport): string {
  const lines = [
    "Section,Group,Client,Total Tasks,Completed,In Progress,Not Started,Pct Completed,Pct In Progress,Pct Not Started,vs Last Week (pts),Net Task Change",
  ];
  const row = (section: string, group: string, client: string, p: PodMetrics) =>
    [
      section,
      group,
      client,
      p.total,
      p.completed,
      p.inProgress,
      p.notStarted,
      p.pctCompleted,
      p.pctInProgress,
      p.pctNotStarted,
      p.wowCompletionChange ?? "",
      p.netTaskChange ?? "",
    ].join(",");

  lines.push(row("Overall", "All PODs", "", report.overall));
  for (const p of report.byPod) lines.push(row("By POD", p.pod, "", p));
  for (const po of report.byPo as PoMetrics[]) {
    lines.push(row("By PO", po.pod.replace(/^PO - /, ""), "", po));
    for (const cl of po.clients) {
      lines.push(
        [
          "By PO / Client",
          po.pod.replace(/^PO - /, ""),
          cl.client,
          cl.total,
          cl.completed,
          cl.inProgress,
          cl.notStarted,
          cl.pctCompleted,
          pctOf(cl.inProgress, cl.total),
          pctOf(cl.notStarted, cl.total),
          "",
          "",
        ].join(",")
      );
    }
  }
  return lines.join("\n");
}
