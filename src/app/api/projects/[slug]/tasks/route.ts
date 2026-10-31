import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const db = await getDb();
  const project = await db.collection("projects").findOne({ slug });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Uses the (projectId, startedAt desc) index
  const runs = await db.collection("analysisRuns")
    .find({ projectId: project._id, status: "completed" }).sort({ startedAt: -1 }).limit(10).toArray();

  const ids = [...new Set(runs.flatMap((r) => [r.fromVersionId, r.toVersionId]))];
  const labels = new Map(
    (await db.collection("specVersions").find({ _id: { $in: ids } }).project({ versionLabel: 1 }).toArray())
      .map((v) => [v._id.toString(), v.versionLabel as string])
  );
  const list = runs.map((r) => ({
    _id: r._id.toString(), verdict: r.verdict, startedAt: r.startedAt,
    label: `${labels.get(r.fromVersionId.toString())} → ${labels.get(r.toVersionId.toString())}`,
  }));

  const want = new URL(req.url).searchParams.get("runId");
  const chosen = runs.find((r) => r._id.toString() === want) ?? runs[0];
  if (!chosen) return NextResponse.json({ runs: [], run: null, tasks: [] });

  // Uses the (runId) index
  const tasks = await db.collection("migrationTasks").find({ runId: chosen._id }).sort({ consumerName: 1, severity: 1, title: 1 }).toArray();
  return NextResponse.json({ runs: list, run: list.find((r) => r._id === chosen._id.toString()), tasks });
}