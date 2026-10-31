import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { slugify } from "@/lib/slug";

export async function GET() {
  const db = await getDb();
  const projects = await db.collection("projects").find().sort({ createdAt: -1 }).toArray();
  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const slug = slugify(name);
  if (!slug) return NextResponse.json({ error: "Please enter a project name." }, { status: 400 });

  const db = await getDb();
  try {
    await db.collection("projects").insertOne({
      name, slug, description: String(body?.description ?? ""), createdAt: new Date(),
    });
    return NextResponse.json({ slug }, { status: 201 });
  } catch (e: any) {
    if (e.code === 11000) return NextResponse.json({ error: `A project "${slug}" already exists.` }, { status: 409 });
    throw e;
  }
}