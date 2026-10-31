import { Db, ObjectId } from "mongodb";

// Which of the consumer's lists should we look in? Depends on what KIND of element changed.
const usedList = {
  $switch: {
    branches: [
      { case: { $eq: ["$$k", "parameter"] }, then: { $ifNull: ["$usages.params", []] } },
      { case: { $eq: ["$$k", "requestField"] }, then: { $ifNull: ["$usages.requestFields", []] } },
      { case: { $eq: ["$$k", "responseField"] }, then: { $ifNull: ["$usages.responseFields", []] } },
    ],
    default: [],
  },
};

function impactPipeline(match: Record<string, unknown>) {
  return [
    // 1. Only changes that could hurt someone. Uses the (toVersionId, severity) index.
    { $match: { ...match, severity: { $in: ["breaking", "potential"] } } },

    // 2. For EACH change, ask the consumers collection "who does this hit?"
    {
      $lookup: {
        from: "consumers",
        // values passed in from the change; $ifNull so operation-level changes (no target) don't break
        let: { pid: "$projectId", m: "$method", p: "$path", t: { $ifNull: ["$target", ""] }, k: "$kind", imp: "$impact" },
        pipeline: [
          { $match: { $expr: { $eq: ["$projectId", "$$pid"] } } },       // only this project's consumers
          { $unwind: "$usages" },                                         // one row per usage
          { $match: { $expr: { $and: [                                    // same endpoint?
              { $eq: ["$usages.method", "$$m"] },
              { $eq: ["$usages.path", "$$p"] },
          ] } } },
          { $addFields: { _list: usedList } },
          { $addFields: {
              _exact: { $in: ["$$t", "$_list"] },                         // lists this exact field/param
              // lists a PARENT of it (reads "amount" => depends on "amount.value")
              _parent: { $anyElementTrue: [ { $map: { input: "$_list", as: "f",
                in: { $eq: [{ $indexOfCP: ["$$t", { $concat: ["$$f", "."] }] }, 0] } } } ] },
          } },
          { $match: { $expr: { $switch: { branches: [
              { case: { $eq: ["$$imp", "operation"] }, then: true },
              { case: { $eq: ["$$imp", "element"] }, then: { $or: ["$_exact", "$_parent"] } },
              { case: { $eq: ["$$imp", "missing"] }, then: { $not: ["$_exact"] } },  // calls it, does NOT send it
          ], default: false } } } },
          // a consumer with two usages of the same endpoint must count once
          { $group: { _id: "$_id", name: { $first: "$name" }, owner: { $first: "$owner" }, repo: { $first: "$repo" } } },
        ],
        as: "hits",
      },
    },

    // 3. One row per (change, consumer) pair. Changes nobody uses vanish here.
    { $unwind: "$hits" },

    // 4. Regroup by consumer, with counts and the list of changes that hit it.
    {
      $group: {
        _id: "$hits._id",
        name: { $first: "$hits.name" }, owner: { $first: "$hits.owner" }, repo: { $first: "$hits.repo" },
        breaking: { $sum: { $cond: [{ $eq: ["$severity", "breaking"] }, 1, 0] } },
        potential: { $sum: { $cond: [{ $eq: ["$severity", "potential"] }, 1, 0] } },
        items: { $push: { changeId: "$_id", severity: "$severity" } },
      },
    },
    { $sort: { breaking: -1, potential: -1, name: 1 } },
  ];
}

export interface ChangeCol {
  _id: string; severity: "breaking" | "potential"; changeType: string; title: string; kind: string;
  impact: string; method: string; path: string; target?: string; elementKey: string;
}
export interface ConsumerImpact {
  _id: string; name: string; owner: string; repo: string;
  breaking: number; potential: number;
  hits: Record<string, "breaking" | "potential">; // changeId -> severity
}
export interface ImpactReport {
  columns: ChangeCol[];
  consumers: ConsumerImpact[];
  summary: { breakingChanges: number; potentialChanges: number; affectedConsumers: number; totalConsumers: number;
             breakingHits: number; breakingNobodyUses: number };
}

export async function analyzeImpact(db: Db, projectId: ObjectId, fromId: ObjectId, toId: ObjectId): Promise<ImpactReport> {
  const match = { projectId, fromVersionId: fromId, toVersionId: toId };

  const [columns, allConsumers, hitRows] = await Promise.all([
    db.collection("changes").find({ ...match, severity: { $in: ["breaking", "potential"] } })
      .sort({ severity: 1, elementKey: 1 }) // "breaking" sorts before "potential"
      .project({ before: 0, after: 0, detail: 0 }).toArray(),
    db.collection("consumers").find({ projectId }).project({ name: 1, owner: 1, repo: 1 }).sort({ name: 1 }).toArray(),
    db.collection("changes").aggregate(impactPipeline(match)).toArray(),
  ]);

  const byId = new Map(hitRows.map((r) => [r._id.toString(), r]));
  const consumers: ConsumerImpact[] = allConsumers.map((c) => {
    const r = byId.get(c._id.toString());
    return {
      _id: c._id.toString(), name: c.name, owner: c.owner ?? "", repo: c.repo ?? "",
      breaking: r?.breaking ?? 0, potential: r?.potential ?? 0,
      hits: Object.fromEntries((r?.items ?? []).map((i: any) => [i.changeId, i.severity])),
    };
  }).sort((a, b) => b.breaking - a.breaking || b.potential - a.potential || a.name.localeCompare(b.name));

  const hitChangeIds = new Set(consumers.flatMap((c) => Object.keys(c.hits)));
  const breakingCols = columns.filter((c) => c.severity === "breaking");

  return {
    columns: columns.map((c) => ({ ...c, _id: String(c._id) })) as ChangeCol[],
    consumers,
    summary: {
      breakingChanges: breakingCols.length,
      potentialChanges: columns.length - breakingCols.length,
      affectedConsumers: consumers.filter((c) => c.breaking + c.potential > 0).length,
      totalConsumers: consumers.length,
      breakingHits: consumers.reduce((n, c) => n + c.breaking, 0),
      breakingNobodyUses: breakingCols.filter((c) => !hitChangeIds.has(String(c._id))).length,
    },
  };
}