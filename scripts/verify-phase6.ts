import "./_env";
import { ObjectId } from "mongodb";
import { getDb, getClient } from "../src/lib/db";
import { runAnalysis } from "../src/lib/impact/run";

let failures = 0;
const check = (ok: boolean, label: string) => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"} ${label}`); };

async function main() {
  const db = await getDb();
  const project = await db.collection("projects").findOne({ slug: "orders-api" });
  if (!project) throw new Error("Run `npm run seed` first");
  const id = async (label: string) => (await db.collection("specVersions").findOne({ projectId: project._id, versionLabel: label, status: "ingested" }))!._id.toString();
  const [v1, v2, v3] = [await id("v1"), await id("v2"), await id("v3")];
  const go = async (f: string, t: string) => {
    const r = await runAnalysis({ projectId: project._id, fromVersionId: f, toVersionId: t, source: "cli" });
    if (!r.ok) throw new Error(r.error);
    return r;
  };
  const tasksOf = (runId: string) => db.collection("migrationTasks");

  // v1 -> v2
  const a = await go(v1, v2);
  const nA = await db.collection("migrationTasks").countDocuments({ runId: new ObjectId(a.run._id) });
  check(a.run.verdict === "do_not_ship", `v1->v2 verdict is do_not_ship (got ${a.run.verdict})`);
  check(nA === 8, `v1->v2 creates 8 tasks (got ${nA})`);

  const billing = await db.collection("migrationTasks").findOne({ runId: new ObjectId(a.run._id), consumerName: "Billing Service" });
  console.log(`   Billing task: ${billing?.title}\n   hint: ${billing?.hint}`);
  check(!!billing && billing.title.includes("response.total") && billing.hint.includes("response.amount.value"), "Billing task names `total` and suggests amount.value");

  // status survives a re-run
  await db.collection("migrationTasks").updateOne({ _id: billing!._id }, { $set: { status: "done" } });
  const b = await go(v1, v2);
  const billing2 = await db.collection("migrationTasks").findOne({ runId: new ObjectId(b.run._id), consumerName: "Billing Service" });
  check(billing2?.status === "done", "task status carried over to the new run");
  check(a.run._id !== b.run._id, "each analysis is its own run record");
  await db.collection("migrationTasks").updateMany({ runId: new ObjectId(b.run._id) }, { $set: { status: "todo" } }); // reset for the demo

  // v2 -> v3
  const c = await go(v2, v3);
  const nC = await db.collection("migrationTasks").countDocuments({ runId: new ObjectId(c.run._id) });
  check(c.run.verdict === "do_not_ship", "v2->v3 verdict is do_not_ship");
  check(nC === 9, `v2->v3 creates 9 tasks (got ${nC})`);

  // failed run is recorded
  const f = await runAnalysis({ projectId: project._id, fromVersionId: v1, toVersionId: v2, source: "cli", simulateFailure: true });
  const stored = await db.collection("analysisRuns").findOne({ _id: new ObjectId(f.run._id) });
  check(!f.ok && stored?.status === "failed" && !!stored.error && !!stored.finishedAt, `failed run stored with status=failed and error="${stored?.error}"`);

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll Phase 6 checks passed");
  await (await getClient()).close();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });