import { createHash } from "node:crypto";

// JSON.stringify keeps object keys in insertion order, so {a,b} and {b,a} hash differently.
// This version sorts keys first, so key order never changes the hash.
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");