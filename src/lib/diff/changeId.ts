import { createHash } from "node:crypto";

export function makeChangeId(p: {
  projectId: string; fromVersionId: string; toVersionId: string; changeType: string; elementKey: string;
}): string {
  // "|" separators stop ambiguity, e.g. ("ab","c") vs ("a","bc") hashing the same.
  const input = [p.projectId, p.fromVersionId, p.toVersionId, p.changeType, p.elementKey].join("|");
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}