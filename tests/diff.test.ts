import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { normalizeSpec } from "../src/lib/spec/normalize";
import { dereferenceSpec } from "../src/lib/spec/dereference";
import { parseSpecText } from "../src/lib/spec/parse";
import { diffElements } from "../src/lib/diff/engine";
import type { Severity } from "../src/lib/diff/rules";

// A tiny spec we mutate one thing at a time.
const base = (): any => ({
  openapi: "3.0.3", info: { title: "t", version: "1" },
  paths: {
    "/orders": {
      get: {
        summary: "List",
        parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["a", "b"] } }],
        responses: { "200": { description: "ok", content: { "application/json": { schema: { type: "array", items: {
          type: "object", required: ["id"],
          properties: { id: { type: "string" }, total: { type: "number" }, status: { type: "string", enum: ["a", "b"] } },
        } } } } } },
      },
      post: {
        requestBody: { content: { "application/json": { schema: {
          type: "object", required: ["customerId"],
          properties: { customerId: { type: "integer" }, note: { type: "string" }, kind: { type: "string", enum: ["x", "y"] } },
        } } } },
        responses: { "201": { description: "created" }, "400": { description: "bad" } },
      },
    },
    "/orders/{id}": {
      get: { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "ok" } } },
      delete: { responses: { "204": { description: "gone" } } },
    },
  },
});
const RESP = (s: any) => s.paths["/orders"].get.responses["200"].content["application/json"].schema.items;
const REQ = (s: any) => s.paths["/orders"].post.requestBody.content["application/json"].schema;
const run = (mutate: (s: any) => void) => {
  const after = base();
  mutate(after);
  return diffElements(normalizeSpec(base()), normalizeSpec(after));
};

type Case = [label: string, mutate: (s: any) => void, changeType: string, severity: Severity];

const cases: Case[] = [
  // ---- BREAKING ----
  ["endpoint removed", (s) => { delete s.paths["/orders/{id}"]; }, "endpoint_removed", "breaking"],
  ["HTTP method removed", (s) => { delete s.paths["/orders/{id}"].delete; }, "method_removed", "breaking"],
  ["request parameter removed", (s) => { s.paths["/orders"].get.parameters = []; }, "param_removed", "breaking"],
  ["parameter became required", (s) => { s.paths["/orders"].get.parameters[0].required = true; }, "param_became_required", "breaking"],
  ["new required parameter", (s) => { s.paths["/orders"].get.parameters.push({ name: "X-Tenant-Id", in: "header", required: true, schema: { type: "string" } }); }, "param_added_required", "breaking"],
  ["request field type changed", (s) => { REQ(s).properties.customerId.type = "string"; }, "request_field_type_changed", "breaking"],
  ["new required request field", (s) => { REQ(s).properties.currency = { type: "string" }; REQ(s).required.push("currency"); }, "request_field_added_required", "breaking"],
  ["request field became required", (s) => { REQ(s).required.push("note"); }, "request_field_became_required", "breaking"],
  ["response field removed", (s) => { delete RESP(s).properties.total; }, "response_field_removed", "breaking"],
  ["response field type changed", (s) => { RESP(s).properties.total.type = "string"; }, "response_field_type_changed", "breaking"],
  ["response status code removed", (s) => { delete s.paths["/orders"].post.responses["400"]; }, "response_status_removed", "breaking"],
  ["enum value removed from request field", (s) => { REQ(s).properties.kind.enum = ["x"]; }, "request_enum_value_removed", "breaking"],
  ["enum value removed from request param", (s) => { s.paths["/orders"].get.parameters[0].schema.enum = ["a"]; }, "param_enum_value_removed", "breaking"],
  ["auth requirement added", (s) => { s.paths["/orders"].get.security = [{ bearer: [] }]; }, "auth_added", "breaking"],
  // ---- POTENTIALLY BREAKING ----
  ["enum value added to response field", (s) => { RESP(s).properties.status.enum.push("c"); }, "response_enum_value_added", "potential"],
  ["response field made nullable", (s) => { RESP(s).properties.total.nullable = true; }, "response_field_became_nullable", "potential"],
  ["response field no longer required", (s) => { RESP(s).required = []; }, "response_field_became_optional", "potential"],
  ["default value changed", (s) => { s.paths["/orders"].get.parameters[0].schema.default = "a"; }, "param_default_changed", "potential"],
  ["endpoint deprecated", (s) => { s.paths["/orders"].get.deprecated = true; }, "endpoint_deprecated", "potential"],
  ["request field removed", (s) => { delete REQ(s).properties.note; }, "request_field_removed", "potential"],
  // ---- SAFE ----
  ["new endpoint", (s) => { s.paths["/new"] = { get: { responses: { "200": { description: "x" } } } }; }, "endpoint_added", "safe"],
  ["new optional parameter", (s) => { s.paths["/orders"].get.parameters.push({ name: "include", in: "query", schema: { type: "string" } }); }, "param_added_optional", "safe"],
  ["new optional request field", (s) => { REQ(s).properties.memo = { type: "string" }; }, "request_field_added_optional", "safe"],
  ["new response field", (s) => { RESP(s).properties.extra = { type: "string" }; }, "response_field_added", "safe"],
  ["enum value added to request field", (s) => { REQ(s).properties.kind.enum.push("z"); }, "request_enum_value_added", "safe"],
  ["enum value removed from response field", (s) => { RESP(s).properties.status.enum = ["a"]; }, "response_enum_value_removed", "safe"],
  ["description-only change", (s) => { s.paths["/orders"].get.summary = "Changed text"; }, "description_changed", "safe"],
];

describe("rule table: change -> classification", () => {
  it.each(cases)("%s", (_label, mutate, changeType, severity) => {
    const found = run(mutate).find((c) => c.changeType === changeType);
    expect(found, `expected a "${changeType}" change`).toBeDefined();
    expect(found!.severity).toBe(severity);
  });
});

describe("engine behaviour", () => {
  it("identical specs produce no changes", () => {
    expect(run(() => {})).toEqual([]);
  });
  it("reordering enum values is not a change", () => {
    expect(run((s) => { RESP(s).properties.status.enum = ["b", "a"]; })).toEqual([]);
  });
  it("removing a whole path reports only endpoint_removed (no child noise)", () => {
    const changes = run((s) => { delete s.paths["/orders/{id}"]; });
    expect(changes.length).toBe(2); // GET and DELETE
    expect(changes.every((c) => c.changeType === "endpoint_removed")).toBe(true);
  });
  it("a brand-new endpoint reports exactly one change", () => {
    expect(run((s) => { s.paths["/new"] = { get: { responses: { "200": { description: "x" } } } }; }).length).toBe(1);
  });
  it("a new required element has impact 'missing' (consumers who DON'T send it break)", () => {
    const c = run((s) => { REQ(s).properties.currency = { type: "string" }; REQ(s).required.push("currency"); });
    expect(c.find((x) => x.changeType === "request_field_added_required")!.impact).toBe("missing");
  });
  it("element keys are human-readable", () => {
    const keys = normalizeSpec(base()).map((e) => e.key);
    expect(keys).toContain("GET /orders/{id}");
    expect(keys).toContain("GET /orders#param:query:status");
    expect(keys).toContain("POST /orders#requestBody.field:customerId");
    expect(keys).toContain("GET /orders#response.200.field:total");
  });
});

// ---- Golden tests: the real sample files that the demo uses ----
async function load(file: string) {
  const p = parseSpecText(fs.readFileSync(file, "utf8"));
  if (!p.ok) throw new Error(p.issue.message);
  return normalizeSpec(await dereferenceSpec(p.doc));
}
const count = (cs: { severity: Severity }[], s: Severity) => cs.filter((c) => c.severity === s).length;

describe("sample Orders API", () => {
  it("v1 -> v2", async () => {
    const cs = diffElements(await load("samples/orders-v1.yaml"), await load("samples/orders-v2.yaml"));
    const has = (type: string, key: string) => cs.some((c) => c.changeType === type && c.elementKey === key);
    expect(has("response_field_removed", "GET /orders/{id}#response.200.field:total")).toBe(true);
    expect(has("method_removed", "DELETE /orders/{id}")).toBe(true);
    expect(has("request_field_added_required", "POST /orders#requestBody.field:currency")).toBe(true);
    expect(has("response_enum_value_added", "GET /orders/{id}#response.200.field:status")).toBe(true);
    expect(has("endpoint_added", "GET /orders/{id}/items")).toBe(true);
    expect([count(cs, "breaking"), count(cs, "potential"), count(cs, "safe")]).toEqual([5, 3, 11]);
  });
  it("v2 -> v3", async () => {
    const cs = diffElements(await load("samples/orders-v2.yaml"), await load("samples/orders-v3.yaml"));
    const has = (type: string, key: string) => cs.some((c) => c.changeType === type && c.elementKey === key);
    expect(has("endpoint_deprecated", "GET /orders")).toBe(true);
    expect(has("param_added_required", "GET /orders#param:header:x-tenant-id")).toBe(true);
    expect(has("response_field_type_changed", "GET /orders/{id}#response.200.field:customerId")).toBe(true);
    expect([count(cs, "breaking"), count(cs, "potential"), count(cs, "safe")]).toEqual([7, 1, 0]);
  });
});