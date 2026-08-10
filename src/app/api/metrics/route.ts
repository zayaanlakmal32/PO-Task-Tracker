import { NextRequest, NextResponse } from "next/server";
import { fetchAllTasks } from "@/lib/notion";
import { buildWeeklyReport } from "@/lib/metrics";
import { weekWindowFor } from "@/lib/week";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const weekStartParam = req.nextUrl.searchParams.get("weekStart");
    const { weekStart, weekEnd } = weekStartParam
      ? weekWindowFor(new Date(`${weekStartParam}T12:00:00Z`))
      : weekWindowFor();

    const tasks = await fetchAllTasks();
    const report = await buildWeeklyReport(tasks, weekStart, weekEnd);
    return NextResponse.json(report);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
