import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { Breakdown, PodMetrics, WeeklyReport } from "./types";
import { formatWeekLabel } from "./week";
import { LOGO_PNG_BASE64 } from "./logo";

// ---- palette (mirrors the dashboard's validated design-system tokens) ----
const INK = rgb(0.043, 0.043, 0.043);
const MUTED = rgb(0.537, 0.529, 0.506);
const FAINT = rgb(0.671, 0.663, 0.635);
const GOOD = rgb(0.047, 0.639, 0.047);
const CRITICAL = rgb(0.816, 0.231, 0.231);
const HAIRLINE = rgb(0.882, 0.878, 0.851);
const CARD_BG = rgb(0.988, 0.988, 0.984);
const ACCENT = rgb(0.165, 0.471, 0.839); // series-1 blue
const WHITE = rgb(1, 1, 1);
const WHITE_MUTED = rgb(0.82, 0.86, 0.93);
const TABLE_HEAD = rgb(0.953, 0.953, 0.945);
const ZEBRA = rgb(0.98, 0.98, 0.976);
const NOT_STARTED_TEXT = rgb(0.42, 0.41, 0.38);
const DONE_COLOR = GOOD;
const PROGRESS_COLOR = ACCENT;
const NOT_STARTED_COLOR = FAINT;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const LEFT = 50;
const RIGHT = 545;
const CONTENT_W = RIGHT - LEFT;
const TOP_MARGIN = 780;
const BOTTOM_MARGIN = 60;
const HEADER_H = 118;

// Header gradient endpoints (near-black -> brand blue), interpolated by hand since
// pdf-lib has no native gradient primitive.
const GRAD_A: [number, number, number] = [0.075, 0.078, 0.086];
const GRAD_B: [number, number, number] = [0.165, 0.471, 0.839];

function deltaValueText(v: number | null): string {
  if (v === null) return "n/a - first week";
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}${Math.abs(v).toFixed(1)} pts`;
}

function deltaColor(v: number | null) {
  if (v === null) return MUTED;
  return v >= 0 ? GOOD : CRITICAL;
}

function wowCell(v: number | null): string {
  return v === null ? "n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(1)} pts`;
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

  textRightAligned(str: string, rightEdge: number, opts: { size?: number; bold?: boolean; color?: any } = {}) {
    const size = opts.size ?? 11;
    const font = opts.bold ? this.bold : this.font;
    const w = font.widthOfTextAtSize(str, size);
    this.page.drawText(str, { x: rightEdge - w, y: this.y, size, font, color: opts.color ?? INK });
  }

  /** Word-wraps long text to the content width instead of running off the page edge. */
  paragraph(str: string, opts: { size?: number; color?: any; lineGap?: number; maxWidth?: number } = {}) {
    const size = opts.size ?? 8;
    const lineGap = opts.lineGap ?? 3;
    const maxWidth = opts.maxWidth ?? CONTENT_W;
    const words = str.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const attempt = current ? `${current} ${word}` : word;
      if (current && this.font.widthOfTextAtSize(attempt, size) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = attempt;
      }
    }
    if (current) lines.push(current);
    for (const line of lines) {
      this.ensureSpace(size + lineGap);
      this.text(line, { size, color: opts.color });
      this.y -= size + lineGap;
    }
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

function drawHeaderGradient(page: PDFPage) {
  const steps = 64;
  const stepW = PAGE_W / steps + 0.6; // slight overlap so no hairline seams show
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const r = GRAD_A[0] + (GRAD_B[0] - GRAD_A[0]) * t;
    const g = GRAD_A[1] + (GRAD_B[1] - GRAD_A[1]) * t;
    const b = GRAD_A[2] + (GRAD_B[2] - GRAD_A[2]) * t;
    page.drawRectangle({ x: i * (PAGE_W / steps), y: PAGE_H - HEADER_H, width: stepW, height: HEADER_H, color: rgb(r, g, b) });
  }
}

/** Small line/dot trend chart drawn straight onto the page at an absolute box. */
function sparkline(page: PDFPage, x: number, y: number, w: number, h: number, points: number[], color: any) {
  if (points.length === 0) return;
  if (points.length === 1) {
    const cy = y + h / 2;
    page.drawLine({ start: { x, y: cy }, end: { x: x + w, y: cy }, thickness: 1, color: HAIRLINE });
    page.drawCircle({ x: x + w - 3, y: cy, size: 2.6, color });
    return;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = w / (points.length - 1);
  const coords = points.map((p, i) => ({ x: x + i * stepX, y: y + ((p - min) / range) * h }));
  for (let i = 0; i < coords.length - 1; i++) {
    page.drawLine({ start: coords[i], end: coords[i + 1], thickness: 1.4, color });
  }
  const last = coords[coords.length - 1];
  page.drawCircle({ x: last.x, y: last.y, size: 2.4, color });
}

function statCard(c: ReportCanvas, x: number, width: number, label: string, value: string, valueColor: any, sub?: string, subColor?: any) {
  const top = c.y;
  const height = sub ? 64 : 50;
  c.page.drawRectangle({ x, y: top - height, width, height, borderColor: HAIRLINE, borderWidth: 1, color: CARD_BG });
  c.page.drawRectangle({ x, y: top - 3, width, height: 3, color: valueColor });
  c.page.drawText(label, { x: x + 10, y: top - 18, size: 8, font: c.font, color: MUTED });
  c.page.drawText(value, { x: x + 10, y: top - 38, size: 18, font: c.bold, color: valueColor });
  if (sub) c.page.drawText(sub, { x: x + 10, y: top - 54, size: 7.8, font: c.font, color: subColor ?? MUTED });
}

function trendCard(
  c: ReportCanvas,
  x: number,
  width: number,
  label: string,
  value: string,
  valueColor: any,
  points: number[]
) {
  const height = 64;
  const top = c.y;
  c.page.drawRectangle({ x, y: top - height, width, height, borderColor: HAIRLINE, borderWidth: 1, color: CARD_BG });
  c.page.drawRectangle({ x, y: top - 3, width, height: 3, color: valueColor });
  c.page.drawText(label, { x: x + 10, y: top - 18, size: 7.5, font: c.font, color: MUTED });
  c.page.drawText(value, { x: x + 10, y: top - 40, size: 14, font: c.bold, color: valueColor });

  const sparkW = 92;
  const sparkH = 24;
  const sparkX = x + width - sparkW - 12;
  sparkline(c.page, sparkX, top - height + 16, sparkW, sparkH, points, valueColor);
  const weeksLabel = points.length <= 1 ? "tracking starts this week" : `${points.length} weeks tracked`;
  c.page.drawText(weeksLabel, { x: sparkX, y: top - height + 6, size: 6.3, font: c.font, color: FAINT });
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

function stackedBar(c: ReportCanvas, x: number, width: number, m: { total: number; completed: number; inProgress: number; notStarted: number }) {
  const total = m.total || 1;
  const h = 9;
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

/** One POD or PO card: name/total/trend header, stacked bar, count+pct summary line, and a nested breakdown table. */
function groupCard(c: ReportCanvas, m: PodMetrics, nested: Breakdown[], nestedLabel: string, displayName?: string) {
  const rowsH = Math.max(nested.length, 1) * 15;
  const estHeight = 18 + 18 + 16 + 20 + rowsH + 22;
  c.ensureSpace(estHeight);

  const name = displayName ?? m.pod;
  c.text(name, { size: 12, bold: true });
  c.textRightAligned(`${m.total} tasks`, RIGHT, { size: 9, color: MUTED });
  c.y -= 14;

  const barW = CONTENT_W - 160;
  stackedBar(c, LEFT, barW, m);
  const sparkX = RIGHT - 84;
  sparkline(c.page, sparkX, c.y, 84, 9, m.trend.map((t) => t.pctCompleted), deltaColor(m.wowCompletionChange));
  c.y -= 18;
  c.text(wowCell(m.wowCompletionChange) === "n/a" ? "vs last wk: n/a" : `vs last wk: ${wowCell(m.wowCompletionChange)}`, {
    x: sparkX,
    size: 7,
    color: deltaColor(m.wowCompletionChange),
  });

  let dotX = LEFT;
  const items: [string, number, number, any][] = [
    ["Done", m.completed, m.pctCompleted, DONE_COLOR],
    ["In progress", m.inProgress, m.pctInProgress, PROGRESS_COLOR],
    ["Not started", m.notStarted, m.pctNotStarted, NOT_STARTED_TEXT],
  ];
  for (const [label, n, p, color] of items) {
    c.page.drawRectangle({ x: dotX, y: c.y - 6, width: 6, height: 6, color });
    const str = `${label} ${n} (${p}%)`;
    c.page.drawText(str, { x: dotX + 9, y: c.y - 7, size: 8, font: c.font, color: MUTED });
    dotX += 9 + c.font.widthOfTextAtSize(str, 8) + 18;
  }
  c.y -= 20;

  // nested table
  const cols = [LEFT, LEFT + 150, LEFT + 205, LEFT + 320, LEFT + 435];
  const headers = [nestedLabel, "Total", "Done", "In Progress", "Not Started"];
  c.page.drawRectangle({ x: LEFT, y: c.y - 15, width: CONTENT_W, height: 17, color: TABLE_HEAD });
  headers.forEach((h, i) => c.page.drawText(h, { x: cols[i] + 4, y: c.y - 11, size: 7.6, font: c.bold, color: MUTED }));
  c.y -= 17;

  if (nested.length === 0) {
    c.text(`No ${nestedLabel.toLowerCase()} attached to these tasks.`, { x: LEFT + 4, size: 8, color: FAINT });
    c.y -= 15;
  } else {
    nested.forEach((n, idx) => {
      if (idx % 2 === 1) c.page.drawRectangle({ x: LEFT, y: c.y - 12, width: CONTENT_W, height: 14, color: ZEBRA });
      const cells = [
        n.name,
        `${n.total}`,
        `${n.completed} (${n.pctCompleted}%)`,
        `${n.inProgress} (${n.pctInProgress}%)`,
        `${n.notStarted} (${n.pctNotStarted}%)`,
      ];
      cells.forEach((cell, i) => c.page.drawText(cell, { x: cols[i] + 4, y: c.y - 9.5, size: 8, font: c.font, color: INK }));
      c.y -= 14;
    });
  }

  c.y -= 8;
  c.hr();
  c.y -= 18;
}

export async function renderReportPdf(report: WeeklyReport): Promise<Uint8Array> {
  const weekLabel = formatWeekLabel(report.weekStart, report.weekEnd);
  const c = await ReportCanvas.create(weekLabel);
  const logo = await c.doc.embedPng(LOGO_PNG_BASE64);

  // Header
  drawHeaderGradient(c.page);
  const logoSize = 42;
  c.page.drawImage(logo, { x: LEFT, y: PAGE_H - HEADER_H + (HEADER_H - logoSize) / 2, width: logoSize, height: logoSize });
  const titleX = LEFT + logoSize + 16;
  c.page.drawText("Weekly POD Task Report", { x: titleX, y: PAGE_H - 48, size: 21, font: c.bold, color: WHITE });
  c.page.drawText(weekLabel, { x: titleX, y: PAGE_H - 68, size: 12, font: c.font, color: WHITE_MUTED });
  c.page.drawText(`Generated ${new Date(report.generatedAt).toLocaleString("en-US")}`, {
    x: titleX,
    y: PAGE_H - 84,
    size: 8.5,
    font: c.font,
    color: WHITE_MUTED,
  });
  c.y = PAGE_H - HEADER_H - 24;

  c.paragraph(
    "\"vs last week\" compares this week's completion rate to the snapshot saved after last week's report; it reads n/a until a second week of history exists. Every POD section below lists all the POs working under it, and every PO section lists all the clients they serve - with counts alongside percentages.",
    { size: 8, color: MUTED }
  );
  c.y -= 12;

  // Overall stat cards
  c.sectionTitle("Overall");
  const o = report.overall;
  const cardW = (CONTENT_W - 3 * 10) / 4;
  statCard(c, LEFT, cardW, "TOTAL TASKS", `${o.total}`, INK);
  statCard(c, LEFT + (cardW + 10), cardW, "COMPLETED", `${o.completed}`, DONE_COLOR, `${o.pctCompleted}% of ${o.total}`);
  statCard(c, LEFT + 2 * (cardW + 10), cardW, "IN PROGRESS", `${o.inProgress}`, PROGRESS_COLOR, `${o.pctInProgress}% of ${o.total}`);
  statCard(c, LEFT + 3 * (cardW + 10), cardW, "NOT STARTED", `${o.notStarted}`, NOT_STARTED_TEXT, `${o.pctNotStarted}% of ${o.total}`);
  c.y -= 74;

  const cardW2 = (CONTENT_W - 10) / 2;
  const wowColor = deltaColor(o.wowCompletionChange);
  trendCard(
    c,
    LEFT,
    cardW2,
    "COMPLETION vs LAST WEEK",
    deltaValueText(o.wowCompletionChange),
    wowColor,
    o.trend.map((t) => t.pctCompleted)
  );
  const net = o.netTaskChange;
  const netColor = net === null ? MUTED : net >= 0 ? GOOD : CRITICAL;
  trendCard(
    c,
    LEFT + (cardW2 + 10),
    cardW2,
    "NET TASK CHANGE (completed minus new)",
    net === null ? "n/a - first week" : `${net >= 0 ? "+" : ""}${net} tasks`,
    netColor,
    o.trend.map((t) => t.completed)
  );
  c.y -= 80;

  legend(c);
  c.y -= 6;

  // By POD (each pod, with every PO under it nested beneath)
  c.sectionTitle("By POD");
  c.paragraph("Each POD's overall status, plus every PO with tasks under that POD this week.", { size: 8.5, color: MUTED });
  c.y -= 8;
  if (report.byPod.length === 0) {
    c.text("No tasks found for this week.", { size: 9, color: FAINT });
    c.y -= 16;
  }
  for (const pod of report.byPod) {
    groupCard(c, pod, pod.pos, "PO");
  }

  // By PO (each PO, with every client they serve nested beneath)
  c.sectionTitle("By PO");
  c.paragraph("Each PO's overall status, plus every client their tasks belong to this week.", { size: 8.5, color: MUTED });
  c.y -= 8;
  if (report.byPo.length === 0) {
    c.text("No tasks found for this week.", { size: 9, color: FAINT });
    c.y -= 16;
  }
  for (const po of report.byPo) {
    groupCard(c, po, po.clients, "Client", po.pod.replace(/^PO - /, ""));
  }

  return c.finish();
}

export function renderReportCsv(report: WeeklyReport): string {
  const lines = [
    "Section,Group,SubGroup,Total Tasks,Completed,In Progress,Not Started,Pct Completed,Pct In Progress,Pct Not Started,vs Last Week (pts),Net Task Change",
  ];
  const row = (section: string, group: string, sub: string, p: { total: number; completed: number; inProgress: number; notStarted: number; pctCompleted: number; pctInProgress: number; pctNotStarted: number; wowCompletionChange?: number | null; netTaskChange?: number | null }) =>
    [
      section,
      group,
      sub,
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
  for (const p of report.byPod) {
    lines.push(row("By POD", p.pod, "", p));
    for (const po of p.pos) lines.push(row("By POD / PO", p.pod, po.name, po));
  }
  for (const po of report.byPo) {
    const poName = po.pod.replace(/^PO - /, "");
    lines.push(row("By PO", poName, "", po));
    for (const cl of po.clients) lines.push(row("By PO / Client", poName, cl.name, cl));
  }
  return lines.join("\n");
}
