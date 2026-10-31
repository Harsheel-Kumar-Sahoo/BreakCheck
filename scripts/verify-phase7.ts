import "./_env";
import { getDb, getClient } from "../src/lib/db";

let failures = 0;
const check = (ok: boolean, label: string) => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"} ${label}`); };
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function post(body: object) {
  const r = await fetch(`${BASE}/api/webhooks/spec`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json() };
}

async function main() {
  const db = await getDb();
  const project = await db.collection("projects").findOne({ slug: "orders-api" });
  if (!project) throw new Error("Run `npm run seed` first");

  // 1. Change stream delivers a new insert (opened directly on analysisRuns, as in the brief)
  const stream = db.collection("analysisRuns").watch([], { fullDocument: "updateLookup" });
  const got = new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 10000);
    stream.on("change", (c: any) => { if (c.fullDocument?.source === "verify-p7") { clearTimeout(t); resolve(true); } });
  });
  await new Promise((r) => setTimeout(r, 1500)); // let the stream attach
  await db.collection("analysisRuns").insertOne({
    projectId: project._id, fromVersionId: project._id, toVersionId: project._id,
    status: "failed", error: "verify-p7 probe", source: "verify-p7", startedAt: new Date(), finishedAt: new Date(),
  });
  check(await got, "change stream delivered the new analysisRuns document");
  await stream.close();
  await db.collection("analysisRuns").deleteMany({ source: "verify-p7" });

  // 2. Webhook idempotency (needs `npm run dev` running)
  const eventId = `verify-${Date.now()}`;
  const spec = "openapi: 3.0.3\ninfo:\n  title: Probe\n  version: 9.9.9\npaths: {}\n";
  let first;
  try { first = await post({ eventId, project: "orders-api", versionLabel: `probe-${Date.now()}`, spec }); }
  catch { console.log("FAIL could not reach the dev server. Start it with `npm run dev` in another terminal."); process.exit(1); }
  const second = await post({ eventId, project: "orders-api", versionLabel: "probe-retry", spec });
  check(first.json.status === "processed", `first delivery processed (${first.json.result?.kind})`);
  check(second.json.status === "duplicate_ignored", "second delivery of the same eventId ignored");
  const n = await db.collection("events").countDocuments({ eventId: `webhook:${eventId}` });
  check(n === 1, `exactly one stored event for that eventId (got ${n})`);

  // 3. Incomplete webhook input is rejected clearly
  const bad = await post({ project: "orders-api" });
  check(bad.status === 400, "webhook without eventId gets 400");

  // clean up the probe version
  await db.collection("specVersions").deleteMany({ projectId: project._id, versionLabel: { $regex: /^probe-/ } });
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll Phase 7 checks passed");
  await (await getClient()).close();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
