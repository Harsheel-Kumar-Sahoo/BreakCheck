import { MongoClient, Db } from "mongodb";

// In Next.js dev mode, files reload constantly. Without this global cache,
// every reload would open a NEW connection and you'd exhaust the free tier's limit.
const g = globalThis as unknown as { _mongoClient?: Promise<MongoClient> };

export function getClient(): Promise<MongoClient> {
  if (!g._mongoClient) {
    // Read the env var lazily (inside the function) so scripts have time to load .env.local first.
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is missing. Check .env.local");
    g._mongoClient = new MongoClient(uri).connect();
  }
  return g._mongoClient;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(process.env.MONGODB_DB ?? "breakcheck");
}