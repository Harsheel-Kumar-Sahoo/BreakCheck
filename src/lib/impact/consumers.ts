export interface Usage { method: string; path: string; params: string[]; requestFields: string[]; responseFields: string[] }
export interface ConsumerInput { name: string; owner: string; repo: string; usages: Usage[] }

const METHODS = new Set(["GET", "PUT", "POST", "DELETE", "OPTIONS", "HEAD", "PATCH", "TRACE"]);

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))] : [];

// Params look like "query:status" or "header:X-Tenant-Id". The spec normalizer lowercases header names
// (HTTP headers are case-insensitive), so we must do the same here or "missing" checks would never match.
function normParam(p: string): string {
  const i = p.indexOf(":");
  const where = p.slice(0, i).trim().toLowerCase();
  const name = p.slice(i + 1).trim();
  return `${where}:${where === "header" ? name.toLowerCase() : name}`;
}

// Never throws on bad content. Problems become warnings; unusable pieces are skipped.
export function validateConsumers(input: unknown): { valid: ConsumerInput[]; warnings: string[]; error?: string } {
  const list = Array.isArray(input) ? input : input && typeof input === "object" ? [input] : null;
  if (!list) return { valid: [], warnings: [], error: "Expected a JSON array of consumers (or a single consumer object)." };

  const valid: ConsumerInput[] = [];
  const warnings: string[] = [];

  list.forEach((raw: any, i) => {
    const name = typeof raw?.name === "string" ? raw.name.trim() : "";
    if (!name) { warnings.push(`Consumer #${i + 1} has no name, so it was skipped.`); return; }
    const owner = typeof raw.owner === "string" ? raw.owner.trim() : "";
    const repo = typeof raw.repo === "string" ? raw.repo.trim() : "";
    if (!owner) warnings.push(`${name}: no owner. Add one so migration tasks have someone to go to.`);
    if (!repo) warnings.push(`${name}: no repo.`);

    const usages: Usage[] = [];
    if (!Array.isArray(raw.usages) || raw.usages.length === 0) {
      warnings.push(`${name}: no usages listed, so it can never be flagged as impacted.`);
    } else {
      for (const u of raw.usages) {
        const method = String(u?.method ?? "").toUpperCase();
        const path = String(u?.path ?? "").trim();
        if (!METHODS.has(method) || !path.startsWith("/")) {
          warnings.push(`${name}: skipped a usage with method "${u?.method}" and path "${u?.path}" (needs an HTTP method and a path starting with "/").`);
          continue;
        }
        const params = strList(u.params).filter((p) => {
          const ok = /^(query|header|path|cookie):.+/i.test(p);
          if (!ok) warnings.push(`${name}: ignored parameter "${p}" on ${method} ${path}. Use the form "query:status" or "header:x-tenant-id".`);
          return ok;
        }).map(normParam);
        usages.push({ method, path, params, requestFields: strList(u.requestFields), responseFields: strList(u.responseFields) });
      }
    }
    valid.push({ name, owner, repo, usages });
  });
  return { valid, warnings };
}