import * as yaml from "js-yaml";

export type SpecIssue = { path: string; message: string; line?: number; column?: number };

export type ParseResult = { ok: true; doc: any } | { ok: false; issue: SpecIssue };

export function parseSpecText(text: string): ParseResult {
  if (!text.trim()) return { ok: false, issue: { path: "(file)", message: "The file is empty." } };
  try {
    // JSON_SCHEMA stops YAML from turning "2024-01-01" into a Date object.
    const doc = yaml.load(text, { schema: yaml.JSON_SCHEMA });
    if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
      return { ok: false, issue: { path: "(root)", message: "An OpenAPI spec must be an object at the top level." } };
    }
    return { ok: true, doc };
  } catch (e: any) {
    return {
      ok: false,
      issue: {
        path: "(syntax)",
        message: e.reason ?? e.message,
        line: e.mark ? e.mark.line + 1 : undefined, // js-yaml counts from 0, humans count from 1
        column: e.mark ? e.mark.column + 1 : undefined,
      },
    };
  }
}