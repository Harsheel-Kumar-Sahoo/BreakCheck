import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";
import { getDb } from "../db";
import { compareVersions } from "../diff/persist";
import { analyzeImpact, type ImpactReport } from "./analyze";
import { buildTask, makeTaskId, type ChangeDoc } from "./tasks";
import { computeVerdict } from "./verdict";

type Source = "ui" | "cli" | "webhook";

export type RunResult =
  | { ok: true; run: { _id: string; status: "completed"; verdict: string; reason: string; summary: Record<string, unknown> }; report: ImpactReport }
  | { ok: false; run: { _id: string; status: "failed"; error: string }; error: string };

export async function runAnalysis(input: {
  projectId: ObjectId; fromVersionId: string; toVersionId: string; source?: Source; simulateFailure?: boolean;
}): Promise<RunResult> {
  const { projectId, source = "ui" } = input;
  const db = await getDb();
  const runs = db.collection("analysisRuns");
  const fromId = new ObjectId(input.fromVersionId), toId = new ObjectId(input.toVersionId);

  const logEvent = (type: string, payload: object) =>
    db.collection("events").insertOne({ eventId: `${source}:${randomUUID()}`, projectId, type, source, payload, receivedAt: new Date() });

  // 1. Record the run BEFORE doing any work.
  const { insertedId: runId } = await runs.insertOne({
    projectId, fromVersionId: fromId, toVersionId: toId, status: "running", source, startedAt: new Date(),
  });

  try {
    if (input.simulateFailure) throw new Error("Simulated failure (demo only).");

    // 2. Diff (idempotent) and impact join
    const cmp = await compareVersions({ projectId, fromVersionId: input.fromVersionId, toVersionId: input.toVersionId, source });
    if (!cmp.ok) throw new Error(cmp.message);
    const report = await analyzeImpact(db, projectId, fromId, toId);
    const all = (await db.collection("changes").find({ projectId, fromVersionId: fromId, toVersionId: toId }).toArray()) as unknown as ChangeDoc[];
    const byId = new Map(all.map((c) => [String(c._id), c]));

    // 3. Carry over task statuses from the previous completed run of the SAME comparison
    const prev = await runs.find({ projectId, fromVersionId: fromId, toVersionId: toId, status: "completed" }).sort({ startedAt: -1 }).limit(1).next();
    const carried = new Map<string, string>();
    if (prev) {
      const old = await db.collection("migrationTasks").find({ runId: prev._id }).project({ consumerId: 1, changeId: 1, status: 1 }).toArray();
      for (const t of old) carried.set(`${t.consumerId}|${t.changeId}`, t.status);
    }

    // 4. One task per (consumer, change) pair, with stable IDs
    const now = new Date();
    const ops = [];
    for (const cons of report.consumers) {
      for (const [changeId, severity] of Object.entries(cons.hits)) {
        const change = byId.get(changeId);
        if (!change) continue;
        const { title, hint } = buildTask(cons.name, change, all);
        ops.push({
          updateOne: {
            filter: { _id: makeTaskId(runId.toString(), cons._id, changeId) } as any,
            update: {
              $set: {
                runId, projectId, consumerId: new ObjectId(cons._id), consumerName: cons.name, changeId,
                title, hint, severity, method: change.method, path: change.path, elementKey: change.elementKey,
              },
              $setOnInsert: { status: carried.get(`${cons._id}|${changeId}`) ?? "todo", createdAt: now, updatedAt: now },
            },
            upsert: true,
          },
        });
      }
    }
    if (ops.length) await db.collection("migrationTasks").bulkWrite(ops, { ordered: false });

    // 5. Verdict + close the run
    const potentialHits = report.consumers.reduce((n, c) => n + c.potential, 0);
    const { verdict, reason } = computeVerdict({
      breakingHits: report.summary.breakingHits, potentialHits, breakingChanges: report.summary.breakingChanges,
    });
    const summary = { ...report.summary, potentialHits, tasks: ops.length, totalChanges: cmp.total, counts: cmp.counts, verdictReason: reason };
    await runs.updateOne({ _id: runId }, { $set: { status: "completed", verdict, summary, finishedAt: new Date() } });
    await logEvent("run.completed", { runId: runId.toString(), verdict, tasks: ops.length });

    return { ok: true, run: { _id: runId.toString(), status: "completed", verdict, reason, summary }, report };
  } catch (e) {
    // Failure is recorded, not hidden. Note: no `verdict` key is written (the validator only allows real verdicts).
    const error = e instanceof Error ? e.message : String(e);
    await runs.updateOne({ _id: runId }, { $set: { status: "failed", error, finishedAt: new Date() } });
    await logEvent("run.failed", { runId: runId.toString(), error });
    return { ok: false, run: { _id: runId.toString(), status: "failed", error }, error };
  }
}