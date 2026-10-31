import "./_env";
import { getDb, getClient } from "../src/lib/db";
import { ingestSpec } from "../src/lib/ingest";

let failures = 0;
const check = (ok: boolean, label: string, extra = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra ? "  -> " + extra : ""}`); };

async function main() {
  const db = await getDb();
  const project = (await db.collection("projects").findOne({ slug: "orders-api" }))!;
  const tag = `edge-${Date.now()}`;
  const go = (label: string, text: string) => ingestSpec({ projectId: project._id, versionLabel: `${tag}-${label}`, text, source: "cli" });

  const empty = await go("empty", "   \n");
  check(empty.kind === "invalid" && empty.errors[0].message.includes("empty"), "empty file is rejected clearly", empty.kind === "invalid" ? empty.errors[0].message : "");

  const swagger = await go("swagger", 'swagger: "2.0"\ninfo:\n  title: Old\n  version: "1"\npaths: {}\n');
  check(swagger.kind === "invalid" && swagger.errors.some((e) => e.message.includes("not supported")), "Swagger 2.0 gets an 'unsupported' message");

  const brokenJson = await go("json", '{"openapi": "3.0.3", "info": {');
  check(brokenJson.kind === "invalid", "malformed JSON is rejected", brokenJson.kind === "invalid" ? `${brokenJson.errors[0].message} (line ${brokenJson.errors[0].line})` : "");

  const notObject = await go("array", "- a\n- b\n");
  check(notObject.kind === "invalid", "a YAML list at the top level is rejected");

  const external = await go("ref", 'openapi: 3.0.3\ninfo:\n  title: T\n  version: "1"\npaths:\n  /x:\n    get:\n      responses:\n        "200":\n          description: ok\n          content:\n            application/json:\n              schema:\n                $ref: "file:///etc/passwd"\n');
  check(external.kind === "invalid", "external file $ref is blocked (no file read)");

  const huge = await go("huge", "x".repeat(2 * 1024 * 1024 + 10));
  check(huge.kind === "bad_request" && huge.message.includes("2 MB"), "file over 2 MB is refused");

  const noLabel = await ingestSpec({ projectId: project._id, versionLabel: "  ", text: "openapi: 3.0.3", source: "cli" });
  check(noLabel.kind === "bad_request", "missing version label is refused");

  // clean up the invalid audit records created by this test
  await db.collection("specVersions").deleteMany({ projectId: project._id, versionLabel: { $regex: `^${tag}` } });
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll edge cases handled");
  await (await getClient()).close();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });