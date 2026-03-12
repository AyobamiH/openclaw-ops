import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

test("Phase 2 structured intelligence APIs expose entities, events, claims, relationships, and search", async () => {
  const root = await mkdtemp(join(tmpdir(), "pdi-phase2-"));
  const source = join(root, "mandelson-chain.txt");
  const ledgerPath = join(root, "ledger.json");
  const objectStorageDir = join(root, "objects");

  await writeFile(
    source,
    [
      "Peter Mandelson met with Sarah White on 2004-03-01 at the Cabinet Office.",
      "Sarah White recommended Peter Mandelson for the ambassador role in an email.",
      "The Cabinet Office committee review approved the appointment on 2004-03-09.",
      "An announcement stated the appointment publicly."
    ].join("\n\n"),
    "utf8"
  );

  const env = loadEnv({
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: "4310",
    LOG_LEVEL: "fatal",
    LEDGER_DRIVER: "filesystem",
    FILESYSTEM_LEDGER_PATH: ledgerPath,
    DATABASE_URL: "postgres://placeholder",
    PGVECTOR_ENABLED: "true",
    PG_BOSS_SCHEMA: "job_queue",
    OBJECT_STORAGE_DRIVER: "filesystem",
    OBJECT_STORAGE_BUCKET: "pdi",
    OBJECT_STORAGE_ENDPOINT: "http://127.0.0.1:9000",
    OBJECT_STORAGE_REGION: "eu-west-2",
    OBJECT_STORAGE_ACCESS_KEY: "key",
    OBJECT_STORAGE_SECRET_KEY: "secret",
    OBJECT_STORAGE_BASE_DIR: objectStorageDir,
    INGESTION_TMP_DIR: join(root, "tmp"),
    MAX_SOURCE_FILE_MB: "10",
    OCR_FALLBACK_ENABLED: "true",
    REVIEW_REQUIRED_FOR_PUBLISH: "true",
    PUBLIC_API_ENABLED: "false"
  });

  const app = buildApp(env);

  try {
    const ingest = await app.inject({
      method: "POST",
      url: "/api/v1/documents/ingest",
      payload: {
        sourcePath: source,
        logicalSourceKey: "mandelson-batch-1/decision-chain-source",
        sourceType: "evidence-pack",
        sourceCollection: "mandelson-batch-1",
        title: "Decision chain source"
      }
    });

    assert.equal(ingest.statusCode, 201);
    const ingestBody = ingest.json();
    assert.ok(ingestBody.entityCount >= 2);
    assert.ok(ingestBody.eventCount >= 3);
    assert.ok(ingestBody.claimCount >= 1);
    assert.ok(ingestBody.relationshipCount >= 2);

    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().mode, "phase-4");

    const entities = await app.inject({ method: "GET", url: "/api/v1/entities?entityType=person" });
    assert.equal(entities.statusCode, 200);
    const entityBody = entities.json();
    assert.ok(entityBody.count >= 2);
    const leadEntity = entityBody.items[0];

    const entityDetail = await app.inject({
      method: "GET",
      url: `/api/v1/entities/${leadEntity.entity.entityId}`
    });
    assert.equal(entityDetail.statusCode, 200);
    assert.ok(entityDetail.json().mentions.length >= 1);

    const events = await app.inject({ method: "GET", url: "/api/v1/events?eventType=approval" });
    assert.equal(events.statusCode, 200);
    assert.ok(events.json().count >= 1);
    const approvalEvent = events.json().items[0];
    assert.equal(approvalEvent.event.eventType, "approval");

    const claims = await app.inject({ method: "GET", url: `/api/v1/claims?documentId=${ingestBody.document.documentId}` });
    assert.equal(claims.statusCode, 200);
    assert.ok(claims.json().count >= 1);
    const claimDetail = await app.inject({
      method: "GET",
      url: `/api/v1/claims/${claims.json().items[0].claim.claimId}`
    });
    assert.equal(claimDetail.statusCode, 200);
    assert.ok(claimDetail.json().citations.length >= 1);

    const relationships = await app.inject({
      method: "GET",
      url: `/api/v1/relationships?documentId=${ingestBody.document.documentId}&predicate=recommended`
    });
    assert.equal(relationships.statusCode, 200);
    assert.ok(relationships.json().count >= 1);

    const search = await app.inject({
      method: "POST",
      url: "/api/v1/search",
      payload: {
        query: "Mandelson",
        sourceCollection: "mandelson-batch-1"
      }
    });
    assert.equal(search.statusCode, 200);
    const searchBody = search.json();
    assert.ok(searchBody.totals.documents >= 1);
    assert.ok(searchBody.totals.entities >= 1);
    assert.ok(searchBody.totals.relationships >= 1);
    assert.ok(searchBody.groups.relationships[0].citation);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
