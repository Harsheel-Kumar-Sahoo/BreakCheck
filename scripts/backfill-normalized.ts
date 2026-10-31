import "./_env";
import { Int32 } from "mongodb";
import { getDb, getClient } from "../src/lib/db";
import { dereferenceSpec } from "../src/lib/spec/dereference";
import { normalizeSpec } from "../src/lib/spec/normalize";

async function main() {
  const db = await getDb();
  const versions = await db.collection("specVersions").find({ status: "ingested" }).toArray();
  for (const v of versions) {
    const normalized = normalizeSpec(await dereferenceSpec(v.rawSpec));
    await db.collection("specVersions").updateOne(
      { _id: v._id },
      { $set: { normalized, elementCount: new Int32(normalized.length) } }
    );
    console.log(`${v.versionLabel}: ${normalized.length} elements`);
  }
  await (await getClient()).close();
}
main().catch((e) => { console.error(e); process.exit(1); });