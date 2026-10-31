import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing. Check .env.local");

  const client = new MongoClient(uri);
  await client.connect();

  const admin = client.db("admin");
  await admin.command({ ping: 1 });

  // "hello" tells us about the server topology.
  const hello = await admin.command({ hello: 1 });
  console.log("Connected to MongoDB");
  console.log("Replica set name:", hello.setName ?? "NONE (change streams won't work!)");

  await client.close();
}

main().catch((err) => {
  console.error("Connection failed:", err.message);
  process.exit(1);
});