import { describe, it, expect } from "vitest";
import { makeChangeId } from "../src/lib/diff/changeId";

const p = { projectId: "p", fromVersionId: "a", toVersionId: "b", changeType: "response_field_removed", elementKey: "GET /orders#response.200.field:total" };

describe("makeChangeId", () => {
  it("is stable for the same input", () => expect(makeChangeId(p)).toBe(makeChangeId({ ...p })));
  it("changes when the element changes", () => expect(makeChangeId(p)).not.toBe(makeChangeId({ ...p, elementKey: "x" })));
  it("changes when the comparison changes", () => expect(makeChangeId(p)).not.toBe(makeChangeId({ ...p, toVersionId: "c" })));
});