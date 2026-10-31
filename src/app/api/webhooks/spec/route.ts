import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ingestSpec } from "@/lib/ingest";

// Body: { "eventId": "evt_123", "project": "orders-api", "versionLabel": "v2", "spec": "<yaml or json text>" }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const eventId = String(body?.eventId ?? "").trim();
  const slug = String(body?.project ?? "").trim();
  if (!eventId || !slug) return NextResponse.json({ error: "eventId and project are required." }, { status: 400 });

  const db = await getDb();
  const project = await db.collection("projects").findOne({ slug });
  if (!project) return NextResponse.json({ error: `Unknown project "${slug}".` }, { status: 404 });

  // INSERT FIRST. The unique index on eventId decides who wins, even for two simultaneous requests.
  const storedId = `webhook:${eventId}`;
  try {
    await db.collection("events").insertOne({
      eventId: storedId, projectId: project._id, type: "webhook.received", source: "webhook",
      payload: { eventId, versionLabel: body?.versionLabel }, receivedAt: new Date(),
    });
  } catch (e: any) {
    if (e.code !== 11000) throw e;
    // A retry: record that we ignored it (with a fresh ID, so this log line is not itself a duplicate).
    await db.collection("events").insertOne({
      eventId: `webhook-dup:${eventId}:${Date.now()}`, projectId: project._id, type: "webhook.duplicate_ignored", source: "webhook",
      payload: { eventId }, receivedAt: new Date(),
    });
    return NextResponse.json({ status: "duplicate_ignored", eventId, message: "This event was already processed." }, { status: 200 });
  }

  const result = await ingestSpec({
    projectId: project._id, versionLabel: String(body?.versionLabel ?? ""), text: String(body?.spec ?? ""), source: "webhook",
  });
  return NextResponse.json({ status: "processed", eventId, result }, { status: result.kind === "created" || result.kind === "duplicate" ? 200 : 422 });
}