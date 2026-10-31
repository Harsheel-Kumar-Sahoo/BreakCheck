import { describe, it, expect } from "vitest";
import { buildMarkdown, buildPrComment } from "../src/lib/impact/report";
import type { ImpactReport } from "../src/lib/impact/analyze";

const report: ImpactReport = {
  columns: [{ _id: "c1", severity: "breaking", changeType: "response_field_removed", title: "Response field removed", kind: "responseField", impact: "element", method: "GET", path: "/orders/{id}", target: "total", elementKey: "k" }],
  consumers: [
    { _id: "1", name: "Billing", owner: "Pay", repo: "r", breaking: 1, potential: 0, hits: { c1: "breaking" } },
    { _id: "2", name: "Analytics", owner: "Data", repo: "r", breaking: 0, potential: 0, hits: {} },
  ],
  summary: { breakingChanges: 1, potentialChanges: 0, affectedConsumers: 1, totalConsumers: 2, breakingHits: 1, breakingNobodyUses: 0 },
};
const meta = { project: "Orders API", from: "v1", to: "v2", verdict: "do_not_ship", reason: "1 breaking change(s) hit declared consumers." };

describe("report builders", () => {
  it("markdown names the broken consumer and the clean one", () => {
    const md = buildMarkdown(report, meta);
    expect(md).toContain("Do not ship");
    expect(md).toContain("### Billing");
    expect(md).toContain("Not affected: Analytics");
  });
  it("PR comment is short and has the verdict", () => {
    const pr = buildPrComment(report, meta);
    expect(pr).toContain("BreakCheck: 🛑 Do not ship");
    expect(pr.split("\n").length).toBeLessThan(20);
  });
});