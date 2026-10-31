import "./_env";
import { getDb, getClient } from "../src/lib/db";

async function main() {
  const db = await getDb();
  const keepProject = process.argv.includes("--keep-project");
  const project = await db.collection("projects").findOne({ slug: "orders-api" });
  if (!project) { console.log("Nothing to reset."); return; }

  for (const c of ["specVersions", "changes", "analysisRuns", "migrationTasks", "events"]) {
    const r = await db.collection(c).deleteMany({ projectId: project._id });
    console.log(`cleared ${c}: ${r.deletedCount}`);
  }
  if (!keepProject) {
    await db.collection("consumers").deleteMany({ projectId: project._id });
    await db.collection("projects").deleteOne({ _id: project._id });
    console.log("removed project and consumers (create 'Orders API' live, then import samples/consumers.json)");
  } else {
    console.log("kept the project and consumers; versions, changes, runs, tasks and events are cleared");
  }
  await (await getClient()).close();
}
main().catch((e) => { console.error(e); process.exit(1); });