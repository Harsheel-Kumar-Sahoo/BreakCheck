import type { RawChange } from "../diff/engine";
import type { ConsumerInput } from "./consumers";

export interface LocalHit { consumer: string; owner: string; severity: "breaking" | "potential"; change: RawChange }

// Same rules as the MongoDB pipeline, written as plain code.
export function matchConsumers(changes: RawChange[], consumers: ConsumerInput[]): LocalHit[] {
  const hits: LocalHit[] = [];
  for (const change of changes) {
    if (change.severity === "safe" || change.impact === "none") continue;
    const t = change.target ?? "";
    for (const c of consumers) {
      const usages = c.usages.filter((u) => u.method === change.method && u.path === change.path);
      const hit = usages.some((u) => {
        if (change.impact === "operation") return true;
        const list = change.kind === "parameter" ? u.params : change.kind === "requestField" ? u.requestFields : change.kind === "responseField" ? u.responseFields : [];
        const exact = list.includes(t);
        const parent = list.some((f) => t.startsWith(f + "."));
        return change.impact === "element" ? exact || parent : !exact; // "missing"
      });
      if (hit) hits.push({ consumer: c.name, owner: c.owner, severity: change.severity, change });
    }
  }
  return hits;
}