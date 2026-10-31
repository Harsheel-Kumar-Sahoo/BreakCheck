import type { ApiElement, Attrs } from "./types";

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
const MAX_DEPTH = 8; // guards against absurdly deep schemas

// allOf = "combine these schemas". We merge them into one so the rest of the code sees one object.
function merged(s: any): any {
  if (!s || !Array.isArray(s.allOf)) return s ?? {};
  const base = { ...s };
  delete base.allOf;
  for (const part of s.allOf.map(merged)) {
    base.type = base.type ?? part.type;
    base.properties = { ...part.properties, ...base.properties };
    base.required = [...(part.required ?? []), ...(base.required ?? [])];
    base.enum = base.enum ?? part.enum;
  }
  return base;
}

// Handles OpenAPI 3.0 ("nullable: true") and 3.1 ("type: [string, null]").
function typeInfo(s: any): { type: string; nullable: boolean } {
  let t = s?.type;
  let nullable = s?.nullable === true;
  if (Array.isArray(t)) {
    nullable = nullable || t.includes("null");
    t = t.find((x: string) => x !== "null");
  }
  if (!t) t = s?.properties ? "object" : s?.items ? "array" : "any";
  if (t === "array") t = `array<${typeInfo(merged(s.items)).type}>`;
  return { type: t, nullable };
}

function schemaAttrs(s: any, required: boolean): Attrs {
  const { type, nullable } = typeInfo(s);
  return {
    required,
    type,
    nullable,
    enum: Array.isArray(s.enum) ? s.enum.map(String).sort() : undefined, // sorted: order must not matter
    default: s.default,
    description: s.description,
  };
}

// Walks an object schema and reports every property as "path.to.field".
// Arrays are looked through: a list of Orders is flattened as if it were one Order.
function walk(schema: any, prefix: string, depth: number, emit: (path: string, attrs: Attrs) => void) {
  const s = merged(schema);
  if (!s || s.$ref || depth > MAX_DEPTH) return; // leftover $ref = circular, stop here
  const node = s.type === "array" ? merged(s.items) : s;
  if (!node || node.$ref) return;
  const required = new Set<string>(node.required ?? []);
  for (const [name, raw] of Object.entries<any>(node.properties ?? {})) {
    const prop = merged(raw);
    const path = prefix ? `${prefix}.${name}` : name;
    emit(path, schemaAttrs(prop, required.has(name)));
    walk(prop, path, depth + 1, emit);
  }
}

function pickSchema(content: any): any {
  if (!content) return undefined;
  const media: any = content["application/json"] ?? Object.values(content)[0];
  return media?.schema;
}

// ["bearer", "apiKey"]: names of the schemes required. [] = no auth.
function authOf(security: any): string[] {
  if (!Array.isArray(security)) return [];
  return [...new Set(security.flatMap((req: any) => Object.keys(req ?? {})))].sort();
}

export function normalizeSpec(spec: any): ApiElement[] {
  const out: ApiElement[] = [];

  for (const [path, pathItem] of Object.entries<any>(spec.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const m of METHODS) {
      const op = pathItem[m];
      if (!op) continue;
      const method = m.toUpperCase();
      const opKey = `${method} ${path}`;
      const base = { method, path };

      out.push({
        key: opKey, kind: "operation", ...base,
        attrs: {
          deprecated: op.deprecated === true,
          auth: authOf(op.security ?? spec.security), // operation-level overrides the global default
          description: op.summary ?? op.description,
        },
      });

      // Parameters: path-level ones apply to every method; operation-level ones override them.
      const params = new Map<string, any>();
      for (const p of [...(pathItem.parameters ?? []), ...(op.parameters ?? [])]) {
        if (!p?.name || !p?.in) continue;
        const name = p.in === "header" ? String(p.name).toLowerCase() : p.name; // headers are case-insensitive
        params.set(`${p.in}:${name}`, p);
      }
      for (const [target, p] of params) {
        const attrs = schemaAttrs(merged(p.schema), p.in === "path" || p.required === true);
        attrs.description = p.description;
        out.push({ key: `${opKey}#param:${target}`, kind: "parameter", ...base, target, attrs });
      }

      // Request body fields
      walk(pickSchema(op.requestBody?.content), "", 0, (fieldPath, attrs) => {
        out.push({ key: `${opKey}#requestBody.field:${fieldPath}`, kind: "requestField", ...base, target: fieldPath, attrs });
      });

      // Responses, one per status code
      for (const [code, resp] of Object.entries<any>(op.responses ?? {})) {
        out.push({ key: `${opKey}#response.${code}`, kind: "response", ...base, statusCode: code, attrs: { description: resp?.description } });
        walk(pickSchema(resp?.content), "", 0, (fieldPath, attrs) => {
          out.push({
            key: `${opKey}#response.${code}.field:${fieldPath}`, kind: "responseField", ...base,
            target: fieldPath, statusCode: code, attrs,
          });
        });
      }
    }
  }
  // Round-trip through JSON to drop every `undefined` (see the BSON gotcha above).
  return JSON.parse(JSON.stringify(out));
}