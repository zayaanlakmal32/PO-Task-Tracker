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
  const
