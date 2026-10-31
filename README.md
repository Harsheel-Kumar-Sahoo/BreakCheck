# BreakCheck: API Change Impact Mapper

> **If I ship this API version, who breaks?**

BreakCheck compares two OpenAPI 3.x specs, classifies every change as breaking, potentially breaking or safe, joins the changes with a consumer map in MongoDB, and tells you exactly which consumers break and why. It generates migration tasks, a release verdict, and runs in CI through a CLI.

Built by **Almost Avengers** (Harsheel Kumar Sahoo, Dhruv Papaiya, Tanishka Jethani) for the NEXUS UNCHARTED MongoDB Student Hackathon, Track 3.

No LLM. Every result comes from a deterministic, unit-tested rule table.

## Run it in 5 steps

1. `npm install`
2. Copy `.env.example` to `.env.local` and set `MONGODB_URI` (a free Atlas M0 cluster; it must be a replica set for change streams).
3. `npm run setup-db` creates collections, validators and indexes.
4. `npm run seed` creates the sample Orders API project and 5 consumers.
5. `npm run dev`, open http://localhost:3000, then upload `samples/orders-v1.yaml`, `v2`, `v3` on the Versions page.

## Demo flow

1. Upload v1 and v2, then open **Impact** and click **Who breaks?** to see "Do not ship".
2. Upload v3 and re-run: Activity updates live through a change stream.
3. Failure cases: upload `samples/orders-invalid.yaml`, upload v1 twice, replay a webhook event twice.
4. CLI: `npx tsx cli/breakcheck.ts compare samples/orders-v1.yaml samples/orders-v2.yaml --consumers samples/consumers.json` exits with code 1.

## MongoDB design

| Collection | Purpose |
|---|---|
| `projects` | one per API (unique `slug`) |
| `specVersions` | raw spec, normalized elements, SHA-256 content checksum |
| `changes` | one per detected change; `_id` is a stable hash, so re-diffing never duplicates |
| `consumers` | who calls which endpoint and which fields |
| `analysisRuns` | `running`, `completed` or `failed` job record with verdict and summary |
| `migrationTasks` | per consumer and change; status survives re-runs |
| `events` | audit trail; unique `eventId` makes webhooks idempotent |

- **Schema validation** (`$jsonSchema`) on `specVersions`, `changes`, `analysisRuns`, `events`. Required fields are enforced; `rawSpec`, `detail` and `payload` stay flexible.
- **Unique indexes:** `(projectId, checksum)` (partial, ingested only), `(projectId, versionLabel)`, `eventId`, `(projectId, name)` on consumers.
- **Query indexes:** `changes(toVersionId, severity)`, `changes(projectId, method, path)`, `analysisRuns(projectId, startedAt desc)`, `migrationTasks(consumerId, status)`, `migrationTasks(runId)`, `events(projectId, receivedAt desc)`. Proof: `npm run explain`.
- **Aggregations:** impact join (`$lookup` with pipeline), severity summary, consumer risk ranking, breaking-changes-per-release trend.
- **Change streams:** one shared stream on `events` feeds the Activity page over Server-Sent Events.

## How the diff works

Specs are dereferenced, then flattened into keyed elements such as `GET /orders/{id}#response.200.field:total`. Diffing is a comparison of two key maps, classified by one declarative rule table (`src/lib/diff/rules.ts`). Direction matters: adding an enum value is safe in a request but potentially breaking in a response.

## Tests and checks

- `npm test` runs the Vitest suite (rule table, task generator, verdicts, consumer validation).
- `npm run verify:p1` to `verify:p8`, `verify:edge`, and `explain` check each layer against your database.

## Limitations

- The consumer map is declared, not discovered. The import API is where a code scanner or gateway-log extractor would plug in.
- `oneOf` / `anyOf` are not expanded yet.
- The change-stream watcher suits a persistent Node server; on serverless it would move to a small worker.