import "./_env";
import { getDb, getClient } from "../src/lib/db";
import { compareVersions } from "../src/lib/diff/persist";

async function main() {
  const db = await getDb();
  const project = await db.collection("projects").findOne({ slug: "orders-api" });
  if (!project) throw new Error("Run `npm run seed` first");
  const v = async (label: string) => {
    const d = await db.collection("specVersions").findOne({ projectId: project._id, versionLabel: label, status: "ingested" });
    if (!d) throw new Error(`Version ${label} is not ingested`);
    return d._id.toString();
  };
  const [v1, v2, v3] = [await v("v1"), await v("v2"), await v("v3")];

  for (const [name, f, t] of [["v1->v2", v1, v2], ["v2->v3", v2, v3]] as const) {
    for (const run of [1, 2]) {
      const r = await compareVersions({ projectId: project._id, fromVersionId: f, toVersionId: t, source: "cli" });
      if (!r.ok) throw new Error(r.message);
      console.log(`${name} run ${run}: total=${r.total} created=${r.created} existing=${r.existing} counts=${JSON.stringify(r.counts)}`);
    }
  }

  const stored = await db.collection("changes").countDocuments({ projectId: project._id });
  console.log(`changes stored in total: ${stored}  (a second run must NOT have grown this)`);

  const plan = await db.collection("changes").find({ toVersionId: project._id, severity: "breaking" }).explain("queryPlanner");
  const uses = JSON.stringify(plan.queryPlanner.winningPlan).includes("IXSCAN");
  console.log(`${uses ? "PASS" : "FAIL"} changes (toVersionId, severity) uses ${uses ? "IXSCAN" : "COLLSCAN"}`);
  await (await getClient()).close();
}
main().catch((e) => { console.error(e); process.exit(1); });