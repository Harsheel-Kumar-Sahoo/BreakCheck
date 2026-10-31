import type { ApiElement, Attrs, ElementKind } from "../spec/types";
import { RULES, type DiffCtx, type Impact, type Severity } from "./rules";

export interface RawChange {
  changeType: string;
  severity: Severity;
  impact: Impact;
  kind: ElementKind;
  title: string;
  elementKey: string;
  method: string;
  path: string;
  target?: string;
  statusCode?: string;
  before?: Attrs;
  after?: Attrs;
  detail: Record<string, unknown>;
}

// Pure function: two element lists in, a list of changes out. No database, no I/O.
export function diffElements(before: ApiElement[], after: ApiElement[]): RawChange[] {
  const b = new Map(before.map((e) => [e.key, e]));
  const a = new Map(after.map((e) => [e.key, e]));

  const ops = (list: ApiElement[]) => list.filter((e) => e.kind === "operation");
  const ctx: DiffCtx = { afterPaths: new Set(ops(after).map((e) => e.path)) };
  // Noise suppression: children of a removed/added operation are not reported separately.
  const removedOps = new Set(ops(before).filter((e) => !a.has(e.key)).map((e) => e.key));
  const addedOps = new Set(ops(after).filter((e) => !b.has(e.key)).map((e) => e.key));

  const changes: RawChange[] = [];
  const keys = [...new Set([...b.keys(), ...a.keys()])].sort(); // sorted = deterministic output

  for (const key of keys) {
    const be = b.get(key);
    const ae = a.get(key);
    const el = (be ?? ae)!;

    if (el.kind !== "operation") {
      const opKey = `${el.method} ${el.path}`;
      if (removedOps.has(opKey) || addedOps.has(opKey)) continue;
    }

    for (const rule of RULES) {
      if (rule.kind !== el.kind) continue;
      if (!rule.when(be?.attrs, ae?.attrs, ctx, el)) continue;
      changes.push({
        changeType: rule.changeType, severity: rule.severity, impact: rule.impact, kind: el.kind, title: rule.title,
        elementKey: key, method: el.method, path: el.path, target: el.target, statusCode: el.statusCode,
        before: be?.attrs, after: ae?.attrs, detail: rule.detail?.(be?.attrs, ae?.attrs) ?? {},
      });
    }
  }
  return changes;
}