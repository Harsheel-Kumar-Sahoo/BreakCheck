import "./_env"; // must be the FIRST import
import { Db, Document } from "mongodb";
import { getDb, getClient } from "../src/lib/db";

const oid = { bsonType: "objectId" };
const str = { bsonType: "string" };
const date = { bsonType: "date" };

// Only REQUIRED fields are listed. rawSpec / detail / payload / summary are deliberately
// left out of "properties", so they stay flexible.
const validators: Record<string, Document> = {
  specVersions: {
    $jsonSchema: {
      bsonType: "object",
      required: ["projectId", "versionLabel", "checksum", "status", "elementCount", "createdAt"],
      properties: {
        projectId: oid,
        versionLabel: { bsonType: "string", minLength: 1 },
        checksum: { bsonType: "string", minLength: 64, maxLength: 64 }, // SHA-256 hex
        status: { enum: ["ingested", "invalid"] },
        elementCount: { bsonType: "int" },
        normalized: { bsonType: "array" },
        validationErrors: { bsonType: "array" },
        createdAt: date,
      },
    },
  },
  changes: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "projectId", "fromVersionId", "toVersionId", "changeType", "severity", "elementKey", "createdAt"],
      properties: {
        _id: str, // the stable changeId hash
        projectId: oid,
        fromVersionId: oid,
        toVersionId: oid,
        changeType: str,
        severity: { enum: ["breaking", "potential", "safe"] },
        elementKey: str,
        method: str,
        path: str,
        createdAt: date,
      },
    },
  },
  analysisRuns: {
    $jsonSchema: {
      bsonType: "object",
      required: ["projectId", "fromVersionId", "toVersionId", "status", "startedAt"],
      properties: {
        projectId: oid,
        fromVersionId: oid,
        toVersionId: oid,
        status: { enum: ["running", "completed", "failed"] },
        verdict: { enum: ["safe_to_ship", "ship_with_caution", "do_not_ship"] },
        error: str,
        startedAt: date,
        finishedAt: date,
      },
    },
  },
  events: {
    $jsonSchema: {
      bsonType: "object",
      required: ["eventId", "projectId", "type", "source", "receivedAt"],
      properties: {
        eventId: { bsonType: "string", minLength: 1 },
        projectId: oid,
        type: str,
        source: { enum: ["ui", "cli", "webhook"] },
        receivedAt: date,
      },
    },
  },
};

const plainCollections = ["projects", "consumers", "migrationTasks"];

async function ensureCollection(db: Db, name: string, validator?: Document) {
  const exists = (await db.listCollections({ name }).toArray()).length > 0;
  if (!exists) {
    await db.createCollection(name, validator ? { validator, validationLevel: "strict", validationAction: "error" } : {});
    console.log(`  created ${name}${validator ? " (with validator)" : ""}`);
  } else if (validator) {
    // collMod updates the validator, so re-running this script is safe (idempotent!)
    await db.command({ collMod: name, validator, validationLevel: "strict", validationAction: "error" });
    console.log(`  updated validator on ${name}`);
  }
}

async function main() {
  const db = await getDb();
  console.log("Collections:");
  for (const [name, v] of Object.entries(validators)) await ensureCollection(db, name, v);
  for (const name of plainCollections) await ensureCollection(db, name);

  console.log("Indexes:");
  const ensure = async (coll: string, keys: Document, opts: Document = {}) => {
    const n = await db.collection(coll).createIndex(keys as any, opts);
    console.log(`  ${coll}: ${n}`);
  };

  // --- UNIQUE indexes (idempotency) ---
  await ensure("projects", { slug: 1 }, { unique: true });
  const onlyIngested = { partialFilterExpression: { status: "ingested" } };
  await ensure("specVersions", { projectId: 1, checksum: 1 }, { unique: true, ...onlyIngested });
  await ensure("specVersions", { projectId: 1, versionLabel: 1 }, { unique: true, ...onlyIngested });
  await ensure("events", { eventId: 1 }, { unique: true });
  await ensure("consumers", { projectId: 1, name: 1 }, { unique: true });
  // (changes and migrationTasks are unique already: their _id is the stable hash)

  // --- QUERY-DRIVEN indexes ---
  await ensure("specVersions", { projectId: 1, createdAt: -1 });          // version timeline
  await ensure("changes", { toVersionId: 1, severity: 1 });                // diff page: "breaking changes of this version"
  await ensure("changes", { projectId: 1, method: 1, path: 1 });           // "history of this endpoint"
  await ensure("consumers", { projectId: 1, "usages.method": 1, "usages.path": 1 }); // impact join
  await ensure("analysisRuns", { projectId: 1, startedAt: -1 });           // "latest run for this project"
  await ensure("migrationTasks", { consumerId: 1, status: 1 });            // tasks page: "open tasks per consumer"
  await ensure("migrationTasks", { runId: 1 });                            // all tasks of a run
  await ensure("events", { projectId: 1, receivedAt: -1 });                // activity feed

  console.log("Done.");
  await (await getClient()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });