import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { riskRanking, trend, openTaskCount } from "@/lib/impact/stats";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const db = await getDb();
  const project = await db.collection("projects").findOne({ slug });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const [risk, trendRows, versions, consumers, openTasks, latest] = await Promise.all([
    riskRanking(db, project._id),
    trend(db, project._id),
    db.collection("specVersions").countDocuments({ projectId: project._id, status: "ingested" }),
    db.collection("consumers").countDocuments({ projectId: project._id }),
    openTaskCount(db, project._id),
    db.collection("analysisRuns").find({ projectId: project._id, status: "completed" }).sort({ startedAt: -1 }).limit(1).next(),
  ]);
  return NextResponse.json({
    risk, trend: trendRows,
    tiles: { versions, consumers, openTasks },
    latest: latest ? { verdict: latest.verdict, reason: latest.summary?.verdictReason } : null,
  });
}