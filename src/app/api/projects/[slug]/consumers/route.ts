import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { validateConsumers } from "@/lib/impact/consumers";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const db = await getDb();
  const project = await db.collection("projects").findOne({ slug });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const consumers = await db.collection("consumers").find({ projectId: project._id }).sort({ name: 1 }).toArray();
  return NextResponse.json({ consumers });
}

// Import or edit: accepts { consumers: [...] } and upserts by (projectId, name).
export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const db = await getDb();
  const project = await db.collection("projects").findOne({ slug });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const { valid, warnings, error } = validateConsumers(body?.consumers);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (valid.length === 0) return NextResponse.json({ error: "No usable consumers found.", warnings }, { status: 422 });

  const now = new Date();
  await db.collection("consumers").bulkWrite(valid.map((c) => ({
    updateOne: {
      filter: { projectId: project._id, name: c.name },
      update: { $set: { owner: c.owner, repo: c.repo, usages: c.usages, updatedAt: now } },
      upsert: true,
    },
  })));
  await db.collection("events").insertOne({
    eventId: `ui:${randomUUID()}`, projectId: project._id, type: "consumers.imported", source: "ui",
    payload: { saved: valid.length, warnings: warnings.length }, receivedAt: now,
  });
  return NextResponse.json({ saved: valid.length, warnings });
}