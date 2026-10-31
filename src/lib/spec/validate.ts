import SwaggerParser from "@apidevtools/swagger-parser";
import type { SpecIssue } from "./parse";

// Finds every $ref that is not a local "#/..." pointer.
function findExternalRefs(node: unknown, path: string, out: SpecIssue[]) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => findExternalRefs(v, `${path}[${i}]`, out));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string" && !v.startsWith("#")) {
        out.push({ path: path || "(root)", message: `External reference "${v}" is not allowed. Only local references (starting with "#/") are supported.` });
      } else {
        findExternalRefs(v, path ? `${path}.${k}` : k, out);
      }
    }
  }
}

export async function validateSpec(doc: any): Promise<SpecIssue[]> {
  const issues: SpecIssue[] = [];

  // Layer 1: our own checks (collects ALL problems, not just the first)
  if (doc.swagger) {
    issues.push({ path: "swagger", message: `Swagger ${doc.swagger} is not supported. Convert the file to OpenAPI 3.x first.` });
  } else if (typeof doc.openapi !== "string" || !/^3\.[01]\./.test(doc.openapi)) {
    issues.push({ path: "openapi", message: `Expected "openapi: 3.0.x" or "3.1.x", got ${JSON.stringify(doc.openapi)}.` });
  }
  if (!doc.info?.title) issues.push({ path: "info.title", message: "Missing required field info.title." });
  if (!doc.info?.version) issues.push({ path: "info.version", message: "Missing required field info.version." });
  if (!doc.paths || typeof doc.paths !== "object") issues.push({ path: "paths", message: "Missing required field paths." });

  findExternalRefs(doc, "", issues);

  // Layer 2: swagger-parser (deep structure + every $ref must resolve)
  // structuredClone: the parser edits the object it receives, and we want to keep ours untouched.
  // external:false: never fetch http:// or file:// references from an uploaded spec.
  if (!doc.swagger) {
    try {
      await SwaggerParser.validate(structuredClone(doc) as any, { resolve: { external: false } } as any);
    } catch (e: any) {
      if (Array.isArray(e.details) && e.details.length) {
        for (const d of e.details) {
          issues.push({ path: (d.instancePath || d.path || "(spec)").toString().replace(/^\//, "").replace(/\//g, "."), message: d.message ?? String(d) });
        }
      } else {
        issues.push({ path: "(spec)", message: String(e.message).split("\n")[0] });
      }
    }
  }
  return issues;
}