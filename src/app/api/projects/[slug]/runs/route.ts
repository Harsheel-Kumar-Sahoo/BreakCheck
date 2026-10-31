import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { runAnalysis } from "@/lib/impact/run";

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const db = await getDb();
  const project = await db.collection("projects").findOne({ slug });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const from = String(body?.fromVersionId ?? ""), to = String(body?.toVersionId ?? "");
  // Bad input is the user's mistake, not a failed job, so no run is recorded.
  if (!ObjectId.isValid(from) || !ObjectId.isValid(to)) return NextResponse.json({ error: "Choose both a From and a To version." }, { status: 400 });
  if (from === to) return NextResponse.json({ error: "From and To are the same version. Pick two different versions." }, { status: 400 });

  const result = await runAnalysis({ projectId: project._id, fromVersionId: from, toVersionId: to, simulateFailure: body?.simulateFailure === true });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}   