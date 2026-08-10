import { NextRequest, NextResponse } from "next/server";
import { fetchAllTasks, upsertSnapshot } from "@/lib/notion";
import { buildWeeklyReport } from "@/lib/metrics";
import { weekWindowFor } from "@/lib/week";
import { renderReportPdf, renderReportCsv } from "@/lib/pdf";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const format: "pdf" | "csv" = body.format === "csv" ? "csv" : "pdf";
    const { weekStart, weekEnd } = body.weekStart
      ? weekWindowFor(new Date(`${body.weekStart}T12:00:00Z`))
      : weekWindowFor();

    const tasks = await fetchAllTasks();
    const report = await buildWeeklyReport(tasks, weekStart, weekEnd);

    // Persist this week's snapshot for every pod, every PO, and overall, so next week's report
    // can compute WoW deltas and trend sparklines for all three groupings (not just PODs).
    await Promise.all(
      [report.overall, ...report.byPod, ...report.byPo].map((p) =>
        upsertSnapshot({
          pod: p.pod,
          weekStart,
          weekEnd,
          total: p.total,
          completed: p.completed,
          inProgress: p.inProgress,
          notStarted: p.notStarted,
          newThisWeek: p.newThisWeek,
          pctCompleted: p.pctCompleted,
          pctInProgress: p.pctInProgress,
          pctNotStarted: p.pctNotStarted,
          wowCompletionChange: p.wowCompletionChange,
          netTaskChange: p.netTaskChange,
        })
      )
    );

    if (format === "csv") {
      const csv = renderReportCsv(report);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="pod-task-report-${weekStart}.csv"`,
        },
      });
    }

    const pdfBytes = await renderReportPdf(report);
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="pod-task-report-${weekStart}.pdf"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
