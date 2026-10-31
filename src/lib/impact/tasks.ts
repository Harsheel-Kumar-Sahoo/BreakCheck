import { createHash } from "node:crypto";

export interface ChangeDoc {
  _id: string; changeType: string; severity: "breaking" | "potential" | "safe"; title: string;
  method: string; path: string; elementKey: string; target?: string; statusCode?: string;
  before?: Record<string, any>; after?: Record<string, any>; detail?: Record<string, any>;
}

export const makeTaskId = (runId: string, consumerId: string, changeId: string) =>
  createHash("sha256").update([runId, consumerId, changeId].join("|")).digest("hex").slice(0, 32);

// ---- rename heuristic ----
function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
const lastSeg = (s: string) => s.split(".").pop()!.toLowerCase();
const similarity = (a: string, b: string) => {
  const x = lastSeg(a), y = lastSeg(b);
  return 1 - lev(x, y) / Math.max(x.length, y.length, 1);
};

export function findRename(removed: ChangeDoc, all: ChangeDoc[]): string | undefined {
  const type = removed.before?.type;
  if (!type || !removed.target) return undefined;
  const cands = all.filter((c) =>
    c.changeType === "response_field_added" && c.method === removed.method && c.path === removed.path &&
    c.statusCode === removed.statusCode && c.after?.type === type && c.target);
  if (cands.length === 1) return cands[0].target;
  const best = cands.map((c) => ({ t: c.target!, s: similarity(c.target!, removed.target!) })).sort((a, b) => b.s - a.s)[0];
  return best && best.s >= 0.6 ? best.t : undefined;
}

// ---- templates ----
const q = (s: string) => "`" + s + "`";

export function buildTask(who: string, c: ChangeDoc, all: ChangeDoc[]): { title: string; hint: string } {
  const ep = `${c.method} ${c.path}`;
  const t = c.target ?? "";
  const vals = Array.isArray(c.detail?.values) ? c.detail!.values.join(", ") : "";

  switch (c.changeType) {
    case "response_field_removed": {
      const r = findRename(c, all);
      return {
        title: `${who}: stop reading ${q("response." + t)} from ${q(ep)}`,
        hint: r
          ? `Likely replacement: ${q("response." + r)} (a new field of the same type was added). Verify the meaning before switching.`
          : "No obvious replacement was found. Check the API changelog or ask the API owner.",
      };
    }
    case "endpoint_removed":
    case "method_removed":
      return { title: `${who}: stop calling ${q(ep)}`, hint: "This endpoint no longer exists. Remove the call or move to its replacement (see the changelog)." };
    case "param_removed":
    case "request_field_removed":
      return { title: `${who}: stop sending ${q(t)} to ${q(ep)}`, hint: "The API no longer defines it. Remove it from your requests." };
    case "param_added_required":
    case "request_field_added_required":
      return { title: `${who}: start sending required ${q(t)} on ${q(ep)}`, hint: "Calls without it will be rejected. Add it to every call to this endpoint." };
    case "param_became_required":
    case "request_field_became_required":
      return { title: `${who}: always send ${q(t)} on ${q(ep)}`, hint: "It used to be optional and is now required. Make sure every call includes it." };
    case "param_type_changed":
    case "request_field_type_changed":
      return { title: `${who}: send ${q(t)} as ${c.after?.type} (was ${c.before?.type}) on ${q(ep)}`, hint: "Update the value you send and any validation around it." };
    case "response_field_type_changed":
      return { title: `${who}: read ${q("response." + t)} as ${c.after?.type} (was ${c.before?.type}) from ${q(ep)}`, hint: "Update parsing, models and any code that assumes the old type." };
    case "param_enum_value_removed":
    case "request_enum_value_removed":
      return { title: `${who}: stop sending value(s) ${vals} for ${q(t)} on ${q(ep)}`, hint: "These values are no longer accepted. Switch to one of the remaining allowed values." };
    case "response_enum_value_added":
      return { title: `${who}: handle new value(s) ${vals} in ${q("response." + t)} from ${q(ep)}`, hint: "Make sure switch/if logic has a safe default branch for values it does not know." };
    case "response_field_became_nullable":
      return { title: `${who}: handle null in ${q("response." + t)} from ${q(ep)}`, hint: "The field can now be null. Add a null check where you read it." };
    case "response_field_became_optional":
      return { title: `${who}: handle a missing ${q("response." + t)} from ${q(ep)}`, hint: "The field is no longer guaranteed. Do not assume it is present." };
    case "param_default_changed":
    case "request_field_default_changed":
    case "response_field_default_changed":
      return {
        title: `${who}: check the default of ${q(t)} on ${q(ep)}`,
        hint: `Default changed from ${JSON.stringify(c.before?.default)} to ${JSON.stringify(c.after?.default)}. If you rely on the old default, set it explicitly.`,
      };
    case "endpoint_deprecated":
      return { title: `${who}: plan to move off ${q(ep)}`, hint: "It still works today but is deprecated. Schedule a migration before it is removed." };
    case "auth_added":
      return { title: `${who}: add authentication to calls to ${q(ep)}`, hint: `New requirement: ${(c.detail?.added ?? []).join(", ") || "authentication"}.` };
    case "response_status_removed":
      return { title: `${who}: stop depending on the ${c.statusCode} response of ${q(ep)}`, hint: "That status code is no longer documented. Update your error handling." };
    default:
      return { title: `${who}: review "${c.title}" on ${q(ep)}`, hint: "No template exists for this change type yet." };
  }
}