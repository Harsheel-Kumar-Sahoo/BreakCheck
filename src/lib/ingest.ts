import { dereferenceSpec } from "./spec/dereference";
import { normalizeSpec } from "./spec/normalize";
import type { ApiElement } from "./spec/types";
import { Int32, ObjectId, Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { parseSpecText, type SpecIssue } from "./spec/parse";
import { validateSpec } from "./spec/validate";
import { stableStringify, sha256 } from "./spec/checksum";

export const MAX_BYTES = 2 * 1024 * 1024; // 2 MB cap protects the 16 MB document limit and the free tier

export type IngestResult =
  | { kind: "created"; version: any }
  | { kind: "duplicate"; version: any }
  | { kind: "invalid"; errors: SpecIssue[]; version: any }
  | { kind: "label_conflict"; message: string }
  | { kind: "bad_request"; message: string };

type Source = "ui" | "cli" | "webhook";

async function logEvent(db: Db, projectId: ObjectId, type: string, source: Source, payload: object) {
  await db.collection("events").insertOne({
    eventId: `${source}:${randomUUID()}`,
    projectId, type, source, payload, receivedAt: new Date(),
  });
}

export async function ingestSpec(input: {
  projectId: ObjectId; versionLabel: string; text: string; source?: Source;
}): Promise<IngestResult> {
  const { projectId, text, source = "ui" } = input;
  const versionLabel = input.versionLabel.trim();
  if (!versionLabel) return { kind: "bad_request", message: "A version label is required (for example: v1)." };
  if (Buffer.byteLength(text) > MAX_BYTES) return { kind: "bad_request", message: "File is larger than 2 MB." };

  const db = await getDb();
  const col = db.collection("specVersions");
  const now = new Date();

  // Helper: store a rejected upload for audit, then report it.
  const rejectAsInvalid = async (errors: SpecIssue[], checksum: string): Promise<IngestResult> => {
    const doc = {
      projectId, versionLabel, checksum, status: "invalid", validationErrors: errors,
      elementCount: new Int32(0), rawText: text, createdAt: now,
    };
    const r = await col.insertOne(doc);
    await logEvent(db, projectId, "spec.invalid", source, { versionLabel, errorCount: errors.length });
    return { kind: "invalid", errors, version: { _id: r.insertedId, versionLabel, status: "invalid", createdAt: now } };
  };

  // 1. parse
  const parsed = parseSpecText(text);
  if (!parsed.ok) return rejectAsInvalid([parsed.issue], sha256(text));

  // 2. validate
  const issues = await validateSpec(parsed.doc);
  if (issues.length) return rejectAsInvalid(issues, sha256(stableStringify(parsed.doc)));

  // 3. checksum of the CONTENT, not the file bytes
  const checksum = sha256(stableStringify(parsed.doc));
  // 3b. normalize: a failure here is reported like any other invalid spec, not as a crash
  let normalized: ApiElement[];
  try {
    normalized = normalizeSpec(await dereferenceSpec(parsed.doc));
  } catch (e: any) {
    return rejectAsInvalid([{ path: "(normalize)", message: `Could not analyse the spec: ${e.message}` }], checksum);
  }

  // 4. insert, and let the unique indexes decide
  const version = {
    projectId, versionLabel, checksum, status: "ingested",
    rawSpec: parsed.doc,
    normalized,              // filled in Phase 3
    elementCount: new Int32(normalized.length),  // filled in Phase 3
    validationErrors: [],
    createdAt: now,
  };
  try {
    const r = await col.insertOne(version);
    await logEvent(db, projectId, "spec.ingested", source, { versionLabel, checksum });
    return { kind: "created", version: { _id: r.insertedId, versionLabel, checksum, status: "ingested", createdAt: now } };
  } catch (e: any) {
    if (e.code !== 11000) throw e; // anything else is a real bug, not a duplicate

    // Which unique index fired? Same content => duplicate. Otherwise the label is taken.
    const existing = await col.findOne(
      { projectId, checksum, status: "ingested" },
      { projection: { rawSpec: 0, normalized: 0, rawText: 0 } }
    );
    if (existing) {
      await logEvent(db, projectId, "spec.duplicate_ignored", source, { versionLabel, existingLabel: existing.versionLabel });
      return { kind: "duplicate", version: existing };
    }
    await logEvent(db, projectId, "spec.label_conflict", source, { versionLabel });
    return { kind: "label_conflict", message: `The label "${versionLabel}" is already used by a version with different content. Pick a new label.` };
  }
}