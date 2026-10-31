import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";
import { getDb } from "../db";
import { diffElements } from "./engine";
import { makeChangeId } from "./changeId";

export type CompareResult =
  | { ok: true; total: number; created: number; existing: number; counts: Record<string, number>; fromLabel: string; toLabel: string }
  | { ok: false; status: number; message: string };

export async function compareVersions(input: {
  projectId: ObjectId; fromVersionId: string; toVersionId: string; source?: "ui" | "cli" | "webhook";
}): Promise<CompareResult> {
  const { projectId, source = "ui" } = input;
  if (!ObjectId.isValid(input.fromVersionId) || !ObjectId.isValid(input.toVersionId))
    return { ok: false, status: 400, message: "Choose both a From and a To version." };
  if (input.fromVersionId === input.toVersionId)
    return { ok: false, status: 400, message: "From and To are the same version. Pick two different versions." };

  const db = await getDb();
  const versions = db.collection("specVersions");
  const load = (id: string) =>
    versions.findOne({ _id: new ObjectId(id), projectId, status: "ingested" }, { projection: { normalized: 1, versionLabel: 1 } });
  const [from, to] = await Promise.all([load(input.fromVersionId), load(input.toVersionId)]);
  if (!from || !to) return { ok: false, status: 404, message: "One of the versions was not found (or it is invalid)." };
  if (!from.normalized?.length || !to.normalized?.length)
    return { ok: false, status: 400, message: "A version has no analysed elements. Run `npm run backfill`." };

  const raw = diffElements(from.normalized, to.normalized);
  const now = new Date();
  const fromId = from._id, toId = to._id;

  const ops = raw.map((c) => {
    const _id = makeChangeId({
      projectId: projectId.toString(), fromVersionId: fromId.toString(), toVersionId: toId.toString(),
      changeType: c.changeType, elementKey: c.elementKey,
    });
    // JSON round trip drops `undefined` (BSON would store it as null, and null breaks our validator).
    const fields = JSON.parse(JSON.stringify(c));
    return {
      updateOne: {
        filter: { _id } as any,
        update: {
          $set: { projectId, fromVersionId: fromId, toVersionId: toId, ...fields },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    };
  });

  let created = 0;
  if (ops.length) { // bulkWrite throws on an empty list
    const res = await db.collection("changes").bulkWrite(ops, { ordered: false });
    created = res.upsertedCount;
  }

  const counts = { breaking: 0, potential: 0, safe: 0 } as Record<string, number>;
  for (const c of raw) counts[c.severity]++;

  await db.collection("events").insertOne({
    eventId: `${source}:${randomUUID()}`, projectId, type: "diff.computed", source,
    payload: { from: from.versionLabel, to: to.versionLabel, total: raw.length, created, counts },
    receivedAt: new Date(),
  });

  return { ok: true, total: raw.length, created, existing: raw.length - created, counts, fromLabel: from.versionLabel, toLabel: to.versionLabel };
}