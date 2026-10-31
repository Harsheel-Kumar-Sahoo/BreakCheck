import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ingestSpec } from "@/lib/ingest";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const db = await getDb();
  const project = await db.collection("projects").findOne({ slug });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Uses the (projectId, createdAt desc) index. The projection leaves out the heavy fields.
  const versions = await db.collection("specVersions")
    .find({ projectId: project._id }, { projection: { rawSpec: 0, normalized: 0, rawText: 0 } })
    .sort({ createdAt: -1 })
    .toArray();
  return NextResponse.json({ project, versions });
}

export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  const db = await getDb();
  const project = await db.collection("projects").findOne({ slug });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const result = await ingestSpec({
    projectId: project._id,
    versionLabel: String(body?.versionLabel ?? ""),
    text: String(body?.text ?? ""),
  });

  const status = { created: 201, duplicate: 200, invalid: 422, label_conflict: 409, bad_request: 400 }[result.kind];
  return NextResponse.json(result, { status });
}