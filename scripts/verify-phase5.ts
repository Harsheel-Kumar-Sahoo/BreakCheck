import "./_env";
import { getDb, getClient } from "../src/lib/db";
import { compareVersions } from "../src/lib/diff/persist";
import { analyzeImpact } from "../src/lib/impact/analyze";

// [breaking, potential] we expect per consumer
const EXPECT: Record<string, Record<string, [number, number]>> = {
  "v1->v2": { "Web App": [2, 2], "Mobile App": [1, 1], "Billing Service": [1, 0], "Analytics Job": [0, 0], "Partner Integration": [1, 0] },
  "v2->v3": { "Web App": [2, 1], "Mobile App": [1, 0], "Billing Service": [2, 0], "Analytics Job": [1, 1], "Partner Integration": [1, 0] },
};

async function main() {
  const db = await getDb();
  const project = await db.collection("projects").findOne({ slug: "orders-api" });
  if (!project) throw new Error("Run `npm run seed` first");
  const id = async (label: string) => (await db.collection("specVersions").findOne({ projectId: project._id, versionLabel: label, status: "ingested" }))!._id;
  const [v1, v2, v3] = [await id("v1"), await id("v2"), await id("v3")];

  let failures = 0;
  for (const [name, f, t] of [["v1->v2", v1, v2], ["v2->v3", v2, v3]] as const) {
    await compareVersions({ projectId: project._id, fromVersionId: f.toString(), toVersionId: t.toString(), source: "cli" });
    const report = await analyzeImpact(db, project._id, f, t);
    console.log(`\n${name}  affected ${report.summary.affectedConsumers}/${report.summary.totalConsumers}, breaking changes nobody uses: ${report.summary.breakingNobodyUses}`);
    for (const c of report.consumers) {
      const want = EXPECT[name][c.name];
      const ok = want && want[0] === c.breaking && want[1] === c.potential;
      if (!ok) failures++;
      console.log(`  ${ok ? "PASS" : "FAIL"} ${c.name.padEnd(20)} breaking=${c.breaking} potential=${c.potential}${ok ? "" : `  (expected ${want})`}`);
    }
  }

  // The headline claim: Analytics Job must NOT be hit by the removal of `total`.
  const report = await analyzeImpact(db, project._id, v1, v2);
  const totalCols = report.columns.filter((c) => c.changeType === "response_field_removed" && c.target === "total").map((c) => c._id);
  const analytics = report.consumers.find((c) => c.name === "Analytics Job")!;
  const flagged = totalCols.some((cid) => analytics.hits[cid]);
  console.log(`\n${flagged ? "FAIL" : "PASS"} Analytics Job is ${flagged ? "WRONGLY" : "correctly NOT"} flagged for the removal of "total"`);
  if (flagged) failures++;

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll impact checks passed");
  await (await getClient()).close();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });