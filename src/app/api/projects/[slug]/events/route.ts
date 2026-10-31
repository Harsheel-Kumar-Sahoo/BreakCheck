import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const db = await getDb();
  const project = await db.collection("projects").findOne({ slug });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  // Uses the (projectId, receivedAt desc) index
  const events = await db.collection("events").find({ projectId: project._id }).sort({ receivedAt: -1 }).limit(50).toArray();
  return NextResponse.json({ projectId: project._id.toString(), events });
}