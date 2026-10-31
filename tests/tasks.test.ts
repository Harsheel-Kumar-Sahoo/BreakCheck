import { describe, it, expect } from "vitest";
import { buildTask, makeTaskId, type ChangeDoc } from "../src/lib/impact/tasks";
import { computeVerdict } from "../src/lib/impact/verdict";

const removed = (target: string, type: string): ChangeDoc => ({
  _id: "r", changeType: "response_field_removed", severity: "breaking", title: "Response field removed",
  method: "GET", path: "/orders/{id}", target, statusCode: "200", elementKey: "k", before: { type },
});
const added = (target: string, type: string): ChangeDoc => ({
  _id: "a" + target, changeType: "response_field_added", severity: "safe", title: "Response field added",
  method: "GET", path: "/orders/{id}", target, statusCode: "200", elementKey: "k2", after: { type },
});

describe("task templates", () => {
  it("removed response field: suggests the only new field of the same type", () => {
    const all = [removed("total", "number"), added("amount", "object"), added("amount.value", "number"), added("amount.currency", "string")];
    const t = buildTask("Billing", all[0], all);
    expect(t.title).toContain("stop reading `response.total`");
    expect(t.hint).toContain("response.amount.value");
  });
  it("removed response field: no candidate means no invented suggestion", () => {
    const all = [removed("total", "number"), added("note", "string")];
    expect(buildTask("Billing", all[0], all).hint).toContain("No obvious replacement");
  });
  it("several same-type candidates: picks the similar name", () => {
    const all = [removed("customerName", "string"), added("customer_name", "string"), added("weight", "string")];
    expect(buildTask("Web", all[0], all).hint).toContain("response.customer_name");
  });
  it("several same-type candidates but none similar: no suggestion", () => {
    const all = [removed("total", "number"), added("weight", "number"), added("height", "number")];
    expect(buildTask("Web", all[0], all).hint).toContain("No obvious replacement");
  });
  it("new required input: tells the consumer to start sending it", () => {
    const c: ChangeDoc = { _id: "x", changeType: "request_field_added_required", severity: "breaking", title: "t", method: "POST", path: "/orders", target: "currency", elementKey: "k" };
    expect(buildTask("Partner", c, [c]).title).toContain("start sending required `currency`");
  });
  it("unknown change types still produce a task", () => {
    const c: ChangeDoc = { _id: "x", changeType: "something_new", severity: "potential", title: "Odd", method: "GET", path: "/x", elementKey: "k" };
    expect(buildTask("A", c, [c]).title).toContain("review");
  });
});

describe("task ids", () => {
  it("are stable and distinct", () => {
    expect(makeTaskId("r", "c", "x")).toBe(makeTaskId("r", "c", "x"));
    expect(makeTaskId("r", "c", "x")).not.toBe(makeTaskId("r2", "c", "x"));
  });
});

describe("verdict", () => {
  it("breaking hit means do not ship", () => expect(computeVerdict({ breakingHits: 1, potentialHits: 0, breakingChanges: 3 }).verdict).toBe("do_not_ship"));
  it("only potential hits means caution", () => expect(computeVerdict({ breakingHits: 0, potentialHits: 2, breakingChanges: 0 }).verdict).toBe("ship_with_caution"));
  it("unused breaking change means caution", () => expect(computeVerdict({ breakingHits: 0, potentialHits: 0, breakingChanges: 1 }).verdict).toBe("ship_with_caution"));
  it("nothing relevant means safe", () => expect(computeVerdict({ breakingHits: 0, potentialHits: 0, breakingChanges: 0 }).verdict).toBe("safe_to_ship"));
});