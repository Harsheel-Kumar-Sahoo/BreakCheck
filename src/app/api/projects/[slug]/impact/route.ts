import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { analyzeImpact } from "@/lib/impact/analyze";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const db = await getDb();
  const project = await db.collection("projects").findOne({ slug });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
  if (!ObjectId.isValid(from) || !ObjectId.isValid(to)) return NextResponse.json({ error: "from and to are required" }, { status: 400 });

  const report = await analyzeImpact(db, project._id, new ObjectId(from), new ObjectId(to));
  return NextResponse.json(report);
}