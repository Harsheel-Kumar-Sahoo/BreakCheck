import { describe, it, expect } from "vitest";
import { validateConsumers } from "../src/lib/impact/consumers";

describe("validateConsumers", () => {
  it("accepts a good consumer without warnings", () => {
    const r = validateConsumers([{ name: "A", owner: "o", repo: "r", usages: [{ method: "get", path: "/x", params: ["header:X-Tenant-Id"], responseFields: ["id"] }] }]);
    expect(r.warnings).toEqual([]);
    expect(r.valid[0].usages[0].method).toBe("GET");
    expect(r.valid[0].usages[0].params).toEqual(["header:x-tenant-id"]); // header lowercased
  });
  it("warns, never throws, on incomplete input", () => {
    const r = validateConsumers([{ name: "A" }, { owner: "nobody" }]);
    expect(r.valid.map((c) => c.name)).toEqual(["A"]); // nameless one skipped
    expect(r.warnings.length).toBeGreaterThanOrEqual(3);
  });
  it("skips unusable usages with a warning", () => {
    const r = validateConsumers([{ name: "A", owner: "o", repo: "r", usages: [{ method: "FETCH", path: "x" }] }]);
    expect(r.valid[0].usages).toEqual([]);
    expect(r.warnings.some((w) => w.includes("skipped a usage"))).toBe(true);
  });
  it("rejects non-JSON-shaped input with an error", () => {
    expect(validateConsumers("hello").error).toBeDefined();
  });
});