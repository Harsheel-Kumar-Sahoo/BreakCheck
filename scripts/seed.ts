import "./_env";
import fs from "node:fs";
import { getDb, getClient } from "../src/lib/db";

async function main() {
  const db = await getDb();
  const now = new Date();

  // upsert = "update if it exists, insert if not". Running seed twice is safe.
  await db.collection("projects").updateOne(
    { slug: "orders-api" },
    { $setOnInsert: { name: "Orders API", slug: "orders-api", description: "Sample Orders API for the BreakCheck demo", createdAt: now } },
    { upsert: true }
  );
  const project = await db.collection("projects").findOne({ slug: "orders-api" });
  if (!project) throw new Error("project missing after upsert");

  const consumers = JSON.parse(fs.readFileSync("samples/consumers.json", "utf8"));
  for (const c of consumers) {
    await db.collection("consumers").updateOne(
      { projectId: project._id, name: c.name },
      { $set: { ...c, projectId: project._id, updatedAt: now } },
      { upsert: true }
    );
  }
  console.log(`Seeded project "${project.name}" (${project._id}) with ${consumers.length} consumers.`);
  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });