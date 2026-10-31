import { Db, ObjectId } from "mongodb";

// Keep only the LATEST completed run per comparison, so re-running an analysis never double counts.
export const latestPerComparison = (projectId: ObjectId) => [
  { $match: { projectId, status: "completed" } },
  { $sort: { startedAt: -1 } },
  { $group: { _id: { f: "$fromVersionId", t: "$toVersionId" }, run: { $first: "$$ROOT" } } },
  { $replaceRoot: { newRoot: "$run" } },
];

// (c) Which consumers carry the most migration risk across all releases?
export function riskRanking(db: Db, projectId: ObjectId) {
  return db.collection("analysisRuns").aggregate([
    ...latestPerComparison(projectId),
    { $lookup: { from: "migrationTasks", localField: "_id", foreignField: "runId", as: "tasks" } }, // uses the runId index
    { $unwind: "$tasks" },
    { $group: {
        _id: "$tasks.consumerId",
        name: { $first: "$tasks.consumerName" },
        breaking: { $sum: { $cond: [{ $eq: ["$tasks.severity", "breaking"] }, 1, 0] } },
        potential: { $sum: { $cond: [{ $eq: ["$tasks.severity", "potential"] }, 1, 0] } },
        open: { $sum: { $cond: [{ $ne: ["$tasks.status", "done"] }, 1, 0] } },
        releases: { $addToSet: "$toVersionId" },
    } },
    // weighted score: a breaking hit counts 3x a potential one
    { $addFields: { score: { $add: [{ $multiply: ["$breaking", 3] }, "$potential"] }, releases: { $size: "$releases" } } },
    { $sort: { score: -1, name: 1 } },
  ]).toArray();
}

// (d) Breaking changes per release, in time order.
export function trend(db: Db, projectId: ObjectId) {
  return db.collection("analysisRuns").aggregate([
    ...latestPerComparison(projectId),
    { $lookup: { from: "specVersions", localField: "fromVersionId", foreignField: "_id", pipeline: [{ $project: { versionLabel: 1 } }], as: "from" } },
    { $lookup: { from: "specVersions", localField: "toVersionId", foreignField: "_id", pipeline: [{ $project: { versionLabel: 1 } }], as: "to" } },
    { $sort: { startedAt: 1 } },
    { $project: {
        _id: 0,
        release: { $concat: [{ $arrayElemAt: ["$from.versionLabel", 0] }, " → ", { $arrayElemAt: ["$to.versionLabel", 0] }] },
        breaking: { $ifNull: ["$summary.counts.breaking", 0] },
        potential: { $ifNull: ["$summary.counts.potential", 0] },
        safe: { $ifNull: ["$summary.counts.safe", 0] },
        breakingHits: { $ifNull: ["$summary.breakingHits", 0] },
        verdict: 1,
    } },
  ]).toArray();
}

// Open tasks, counted over the latest run of each comparison only (re-runs must not inflate it).
export async function openTaskCount(db: Db, projectId: ObjectId): Promise<number> {
  const r = await db.collection("analysisRuns").aggregate([
    ...latestPerComparison(projectId),
    { $lookup: { from: "migrationTasks", localField: "_id", foreignField: "runId", as: "tasks" } },
    { $unwind: "$tasks" },
    { $match: { "tasks.status": { $ne: "done" } } },
    { $count: "n" },
  ]).toArray();
  return r[0]?.n ?? 0;
}   