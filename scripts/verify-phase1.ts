import "./_env";
import { getDb, getClient } from "../src/lib/db";

async function expectError(label: string, fn: () => Promise<unknown>, code: number) {
  try {
    await fn();
    console.log(`FAIL ${label}: no error was thrown`);
  } catch (e: any) {
    console.log(`${e.code === code ? "PASS" : "FAIL"} ${label} (error code ${e.code})`);
  }
}

async function main() {
  const db = await getDb();
  const project = await db.collection("projects").findOne({ slug: "orders-api" });
  if (!project) throw new Error("Run `npm run seed` first");

  // 1. Schema validation rejects a document missing required fields (code 121)
  await expectError("validator rejects incomplete specVersion",
    () => db.collection("specVersions").insertOne({ foo: "bar" }), 121);

  // 2. Validator rejects a bad enum value
  await expectError("validator rejects severity='huge'",
    () => db.collection("changes").insertOne({
      _id: "x" as any, projectId: project._id, fromVersionId: project._id, toVersionId: project._id,
      changeType: "t", severity: "huge", elementKey: "k", createdAt: new Date(),
    }), 121);

  // 3. Unique index rejects a duplicate event (code 11000)
  const ev = { eventId: "verify-1", projectId: project._id, type: "test", source: "cli", receivedAt: new Date() };
  await db.collection("events").deleteMany({ eventId: "verify-1" });
  await db.collection("events").insertOne({ ...ev });
  await expectError("unique index rejects duplicate eventId",
    () => db.collection("events").insertOne({ ...ev }), 11000);
  await db.collection("events").deleteMany({ eventId: "verify-1" });

  // 4. explain(): are our indexes actually used?
  const checks: [string, any][] = [
    ["changes (toVersionId, severity)", db.collection("changes").find({ toVersionId: project._id, severity: "breaking" })],
    ["analysisRuns (projectId, startedAt)", db.collection("analysisRuns").find({ projectId: project._id }).sort({ startedAt: -1 })],
    ["migrationTasks (consumerId, status)", db.collection("migrationTasks").find({ consumerId: project._id, status: "todo" })],
  ];
  for (const [label, cursor] of checks) {
    const plan = await cursor.explain("queryPlanner");
    const uses = JSON.stringify(plan.queryPlanner.winningPlan).includes("IXSCAN");
    console.log(`${uses ? "PASS" : "FAIL"} ${label} uses ${uses ? "IXSCAN (index)" : "COLLSCAN (no index)"}`);
  }
  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });