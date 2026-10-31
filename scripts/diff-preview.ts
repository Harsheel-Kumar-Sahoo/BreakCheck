import fs from "node:fs";
import { parseSpecText } from "../src/lib/spec/parse";
import { dereferenceSpec } from "../src/lib/spec/dereference";
import { normalizeSpec } from "../src/lib/spec/normalize";
import { diffElements } from "../src/lib/diff/engine";

async function load(file: string) {
  const p = parseSpecText(fs.readFileSync(file, "utf8"));
  if (!p.ok) throw new Error(`${file}: ${p.issue.message}`);
  return normalizeSpec(await dereferenceSpec(p.doc));
}

async function main() {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) throw new Error("Usage: npm run diff:preview -- samples/orders-v1.yaml samples/orders-v2.yaml");
  const changes = diffElements(await load(from), await load(to));
  for (const sev of ["breaking", "potential", "safe"] as const) {
    const group = changes.filter((c) => c.severity === sev);
    console.log(`\n${sev.toUpperCase()} (${group.length})`);
    for (const c of group) console.log(`  ${c.changeType.padEnd(32)} ${c.elementKey}  [impact: ${c.impact}]`);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });