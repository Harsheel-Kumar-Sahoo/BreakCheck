import { getDb } from "./db";

export type LiveMessage = {
  id: string; kind: "event" | "run" | "task"; type: string; text: string; projectId?: string; at: string;
};
type Listener = (m: LiveMessage) => void;

const g = globalThis as unknown as { _live?: { listeners: Set<Listener>; started: boolean } };
const state = (g._live ??= { listeners: new Set(), started: false });

// Turn a raw database change into a short human sentence.
function describe(coll: string, doc: any): LiveMessage | null {
  const at = new Date().toISOString();
  if (coll === "events") {
    const p = doc.payload ?? {};
    const text: Record<string, string> = {
      "spec.ingested": `Spec ${p.versionLabel} ingested`,
      "spec.duplicate_ignored": `Duplicate upload ignored (${p.versionLabel} matches ${p.existingLabel})`,
      "spec.invalid": `Invalid spec rejected (${p.errorCount} problem(s))`,
      "spec.label_conflict": `Label ${p.versionLabel} already used`,
      "diff.computed": `Diff ${p.from} → ${p.to}: ${p.total} changes`,
      "run.completed": `Run completed: ${String(p.verdict).replaceAll("_", " ")}, ${p.tasks} tasks`,
      "run.failed": `Run failed: ${p.error}`,
      "task.updated": `Task ${p.status}: ${p.consumer}`,
      "consumers.imported": `${p.saved} consumer(s) imported`,
      "webhook.duplicate_ignored": `Webhook retry ignored (event ${p.eventId})`,
      "webhook.received": `Webhook received (event ${p.eventId})`,
    };
    return { id: String(doc._id), kind: "event", type: doc.type, text: text[doc.type] ?? doc.type, projectId: String(doc.projectId), at };
  }
  return null;
}

async function start() {
  if (state.started) return;
  state.started = true;
  const db = await getDb();
  // One stream on the whole database. We only forward inserts into `events`, because every
  // important action already writes an event. (Run and task changes arrive that way too.)
  const stream = db.watch(
    [{ $match: { operationType: "insert", "ns.coll": "events" } }],
    { fullDocument: "updateLookup" }
  );
  stream.on("change", (ch: any) => {
    const msg = describe(ch.ns.coll, ch.fullDocument);
    if (msg) state.listeners.forEach((l) => l(msg));
  });
  stream.on("error", (e) => { console.error("change stream error:", e.message); state.started = false; });
  stream.on("close", () => { state.started = false; });
}

export async function subscribe(l: Listener): Promise<() => void> {
  state.listeners.add(l);
  await start();
  return () => state.listeners.delete(l);
}