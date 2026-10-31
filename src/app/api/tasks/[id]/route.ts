import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

const STATUSES = ["todo", "in_progress", "done"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (!STATUSES.includes(status)) return NextResponse.json({ error: "status must be todo, in_progress or done" }, { status: 400 });

  const db = await getDb();
  const col = db.collection("migrationTasks");
  const task = await col.findOne({ _id: id as any });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  await col.updateOne({ _id: id as any }, { $set: { status, updatedAt: new Date() } });
  await db.collection("events").insertOne({
    eventId: `ui:${randomUUID()}`, projectId: task.projectId, type: "task.updated", source: "ui",
    payload: { taskId: id, consumer: task.consumerName, title: task.title, status }, receivedAt: new Date(),
  });
  return NextResponse.json({ ok: true, status });
}