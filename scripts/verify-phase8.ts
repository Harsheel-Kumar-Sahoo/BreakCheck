import "./_env";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { getDb, getClient } from "../src/lib/db";
import { riskRanking, trend } from "../src/lib/impact/stats";

let failures = 0;
const check = (ok: boolean, label: string) => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"} ${label}`); };
const cli = (...a: string[]) => spawnSync("npx", ["tsx", "cli/breakcheck.ts", ...a], { encoding: "utf8", shell: true });

async function main() {
  const C = ["--consumers", "samples/consumers.json"];

  const a = cli("compare", "samples/orders-v1.yaml", "samples/orders-v2.yaml", ...C);
  check(a.status === 1, `v1 -> v2 exits 1 (got ${a.status})`);
  check(a.stdout.includes("DO NOT SHIP"), "v1 -> v2 prints DO NOT SHIP");
  check(/Analytics Job/.test(a.stdout) === false, "v1 -> v2 does not mention Analytics Job (precision)");

  const same = cli("compare", "samples/orders-v1.yaml", "samples/orders-v1.yaml", ...C);
  check(same.status === 0, `identical specs exit 0 (got ${same.status})`);

  const bad = cli("compare", "samples/orders-invalid.yaml", "samples/orders-v1.yaml", ...C);
  check(bad.status === 2, `invalid spec exits 2 (got ${bad.status})`);

  const missing = cli("compare", "nope.yaml", "samples/orders-v1.yaml", ...C);
  check(missing.status === 2, `missing file exits 2 (got ${missing.status})`);

  // CLI and web app must agree: same tasks per consumer as the MongoDB pipeline produced (8 for v1->v2)
  const j = JSON.parse(cli("compare", "samples/orders-v1.yaml", "samples/orders-v2.yaml", ...C, "--json").stdout);
  check(j.tasks.length === 8, `CLI produces 8 tasks for v1 -> v2, same as the app (got ${j.tasks.length})`);
  const j3 = JSON.parse(cli("compare", "samples/orders-v2.yaml", "samples/orders-v3.yaml", ...C, "--json").stdout);
  check(j3.tasks.length === 9, `CLI produces 9 tasks for v2 -> v3, same as the app (got ${j3.tasks.length})`);

  const db = await getDb();
  const project = (await db.collection("projects").findOne({ slug: "orders-api" }))!;
  const risk = await riskRanking(db, project._id);
  const tr = await trend(db, project._id);
  console.log("\nRisk ranking:"); for (const r of risk) console.log(`  ${r.name.padEnd(20)} breaking=${r.breaking} potential=${r.potential} score=${r.score}`);
  console.log("Trend:"); for (const t of tr) console.log(`  ${t.release.padEnd(10)} breaking=${t.breaking} potential=${t.potential} safe=${t.safe}`);
  check(tr.length >= 2, `trend has one row per compared release (got ${tr.length})`);
  check(risk.length > 0, "risk ranking is not empty");

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll Phase 8 checks passed");
  await (await getClient()).close();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });