import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { compareVersions } from "@/lib/diff/persist";

type Ctx = { params: Promise<{ slug: string }> };

async function findProject(slug: string) {
  const db = await getDb();
  return db.collection("projects").findOne({ slug });
}

// POST = "compute and save". Safe to call repeatedly.
export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const project = await findProject(slug);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const r = await compareVersions({
    projectId: project._id, fromVersionId: String(body?.fromVersionId ?? ""), toVersionId: String(body?.toVersionId ?? ""),
  });
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
  return NextResponse.json(r);
}

// GET = "read what was saved", plus the severity summary from an aggregation pipeline.
export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const project = await findProject(slug);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
  if (!ObjectId.isValid(from) || !ObjectId.isValid(to))
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });

  const db = await getDb();
  const match = { projectId: project._id, fromVersionId: new ObjectId(from), toVersionId: new ObjectId(to) };

  const [changes, rows] = await Promise.all([
    db.collection("changes").find(match).sort({ elementKey: 1 }).toArray(),
    db.collection("changes").aggregate([
      { $match: match },
      { $group: { _id: "$severity", count: { $sum: 1 } } },
    ]).toArray(),
  ]);
  const summary = { breaking: 0, potential: 0, safe: 0 } as Record<string, number>;
  for (const r of rows) summary[r._id as string] = r.count;
  return NextResponse.json({ changes, summary });
}