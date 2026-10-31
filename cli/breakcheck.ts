#!/usr/bin/env node
import fs from "node:fs";
import { parseSpecText } from "../src/lib/spec/parse";
import { validateSpec } from "../src/lib/spec/validate";
import { dereferenceSpec } from "../src/lib/spec/dereference";
import { normalizeSpec } from "../src/lib/spec/normalize";
import { diffElements } from "../src/lib/diff/engine";
import { validateConsumers } from "../src/lib/impact/consumers";
import { matchConsumers } from "../src/lib/impact/local";
import { buildTask, type ChangeDoc } from "../src/lib/impact/tasks";
import { computeVerdict } from "../src/lib/impact/verdict";

const USAGE = `Usage: breakcheck compare <old-spec> <new-spec> --consumers <consumers.json> [--json] [--strict]

Exit codes: 0 = safe (or caution), 1 = breaking changes hit consumers, 2 = bad input`;

function fail(msg: string): never { console.error(`error: ${msg}`); process.exit(2); }

async function load(file: string) {
  if (!fs.existsSync(file)) fail(`file not found: ${file}`);
  const p = parseSpecText(fs.readFileSync(file, "utf8"));
  if (!p.ok) fail(`${file}: ${p.issue.message}${p.issue.line ? ` (line ${p.issue.line})` : ""}`);
  const issues = await validateSpec(p.doc);
  if (issues.length) fail(`${file} is not a valid OpenAPI spec:\n` + issues.map((i) => `  - ${i.path}: ${i.message}`).join("\n"));
  return normalizeSpec(await dereferenceSpec(p.doc));
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (n: string) => args.includes(n);
  const cIdx = args.indexOf("--consumers");
  const consumersFile = cIdx >= 0 ? args[cIdx + 1] : undefined;
  const pos = args.filter((a, i) => !a.startsWith("--") && i !== cIdx + 1);
  if (pos[0] !== "compare" || pos.length < 3 || !consumersFile) { console.error(USAGE); process.exit(2); }

  const [oldFile, newFile] = [pos[1], pos[2]];
  const before = await load(oldFile);
  const after = await load(newFile);

  if (!fs.existsSync(consumersFile)) fail(`file not found: ${consumersFile}`);
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(consumersFile, "utf8")); } catch (e: any) { fail(`${consumersFile} is not valid JSON: ${e.message}`); }
  const { valid: consumers, warnings, error } = validateConsumers(raw);
  if (error) fail(error);

  const changes = diffElements(before, after);
  const hits = matchConsumers(changes, consumers);
  const breakingHits = hits.filter((h) => h.severity === "breaking");
  const potentialHits = hits.filter((h) => h.severity === "potential");
  const breakingChanges = changes.filter((c) => c.severity === "breaking").length;
  const { verdict, reason } = computeVerdict({ breakingHits: breakingHits.length, potentialHits: potentialHits.length, breakingChanges });

  // Tasks reuse the same generator as the web app.
  const docs: ChangeDoc[] = changes.map((c) => ({ ...c, _id: c.elementKey + c.changeType } as unknown as ChangeDoc));
  const tasks = hits.map((h) => {
    const doc = docs.find((d) => d.elementKey === h.change.elementKey && d.changeType === h.change.changeType)!;
    return { consumer: h.consumer, severity: h.severity, ...buildTask(h.consumer, doc, docs) };
  });

  if (flag("--json")) {
    console.log(JSON.stringify({ verdict, reason, changes: changes.length, warnings, tasks }, null, 2));
  } else {
    const label = { safe_to_ship: "SAFE TO SHIP", ship_with_caution: "SHIP WITH CAUTION", do_not_ship: "DO NOT SHIP" }[verdict];
    console.log(`\nBreakCheck: ${oldFile} -> ${newFile}`);
    console.log(`${changes.length} changes: ${changes.filter((c) => c.severity === "breaking").length} breaking, ${changes.filter((c) => c.severity === "potential").length} potential, ${changes.filter((c) => c.severity === "safe").length} safe`);
    for (const w of warnings) console.log(`warning: ${w}`);
    const byConsumer = new Map<string, typeof tasks>();
    for (const t of tasks) byConsumer.set(t.consumer, [...(byConsumer.get(t.consumer) ?? []), t]);
    for (const [name, list] of byConsumer) {
      console.log(`\n${name} (${list.filter((t) => t.severity === "breaking").length} breaking, ${list.filter((t) => t.severity === "potential").length} potential)`);
      for (const t of list) console.log(`  [${t.severity}] ${t.title}\n      ${t.hint}`);
    }
    console.log(`\n=> ${label}: ${reason}\n`);
  }

  process.exit(verdict === "do_not_ship" || (flag("--strict") && verdict === "ship_with_caution") ? 1 : 0);
}
main().catch((e) => { console.error(`error: ${e.message}`); process.exit(2); });