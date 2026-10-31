import "./_env";
import { getDb, getClient } from "../src/lib/db";

async function main() {
  const db = await getDb();
  const project = (await db.collection("projects").findOne({ slug: "orders-api" }))!;
  const run = (await db.collection("analysisRuns").find({ projectId: project._id, status: "completed" }).sort({ startedAt: -1 }).limit(1).next())!;
  const consumer = (await db.collection("consumers").findOne({ projectId: project._id }))!;

  const cases: [string, string, any][] = [
    ["Diff page: breaking changes of a version", "changes (toVersionId, severity)",
      db.collection("changes").find({ toVersionId: run.toVersionId, severity: "breaking" })],
    ["Endpoint history", "changes (projectId, method, path)",
      db.collection("changes").find({ projectId: project._id, method: "GET", path: "/orders/{id}" })],
    ["Latest run for a project", "analysisRuns (projectId, startedAt desc)",
      db.collection("analysisRuns").find({ projectId: project._id }).sort({ startedAt: -1 }).limit(1)],
    ["Open tasks per consumer", "migrationTasks (consumerId, status)",
      db.collection("migrationTasks").find({ consumerId: consumer._id, status: "todo" })],
    ["All tasks of a run", "migrationTasks (runId)",
      db.collection("migrationTasks").find({ runId: run._id })],
    ["Activity feed", "events (projectId, receivedAt desc)",
      db.collection("events").find({ projectId: project._id }).sort({ receivedAt: -1 }).limit(50)],
    ["Duplicate spec check", "specVersions unique (projectId, checksum)",
      db.collection("specVersions").find({ projectId: project._id, checksum: "x".repeat(64), status: "ingested" })],
    ["Webhook duplicate check", "events unique (eventId)",
      db.collection("events").find({ eventId: "webhook:demo-1" })],
  ];

  let bad = 0;
  for (const [question, index, cursor] of cases) {
    const plan = await cursor.explain("executionStats");
    const stage = JSON.stringify(plan.queryPlanner.winningPlan);
    const ix = stage.includes("IXSCAN");
    const s = plan.executionStats;
    if (!ix) bad++;
    console.log(`${ix ? "PASS" : "FAIL"} ${question}\n     index: ${index}\n     plan: ${ix ? "IXSCAN" : "COLLSCAN"}  keysExamined=${s.totalKeysExamined}  docsExamined=${s.totalDocsExamined}  returned=${s.nReturned}`);
  }
  console.log(bad ? `\n${bad} query(ies) not using an index` : "\nAll queries use an index");
  await (await getClient()).close();
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });