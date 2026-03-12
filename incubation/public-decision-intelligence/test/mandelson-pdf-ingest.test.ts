import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

test("Actual Mandelson PDF ingests into structured evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "pdi-mandelson-pdf-"));
  const ledgerPath = join(root, "ledger.json");
  const objectStorageDir = join(root, "objects");
  const source = resolve("V1_FINAL.pdf");

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
    MAX_SOURCE_FILE_MB: "50",
    OCR_FALLBACK_ENABLED: "true",
    REVIEW_REQUIRED_FOR_PUBLISH: "true",
    PUBLIC_API_ENABLED: "true"
  });

  const app = buildApp(env);

  try {
    const ingest = await app.inject({
      method: "POST",
      url: "/api/v1/documents/ingest",
      payload: {
        sourcePath: source,
        logicalSourceKey: "mandelson-batch-1/v1-final",
        sourceType: "parliamentary-return",
        sourceCollection: "mandelson-batch-1",
        title: "Lord Mandelson return volume I"
      }
    });

    assert.equal(ingest.statusCode, 201);
    const body = ingest.json();
    assert.equal(body.document.parseStatus, "complete");
    assert.equal(body.document.ocrStatus, "not_needed");
    assert.ok(body.chunkCount > 100);
    assert.ok(body.citationCount === body.chunkCount);
    assert.ok(body.entityCount > 0);
    assert.ok(body.claimCount > 0);
    assert.ok(body.decisionChainCount > 0);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/documents/${body.document.documentId}`
    });
    assert.equal(detail.statusCode, 200);
    const detailBody = detail.json();
    assert.match(detailBody.chunks[0].text, /Mandelson|Ambassador|House of Commons/i);

    const search = await app.inject({
      method: "POST",
      url: "/api/v1/search",
      payload: {
        query: "Mandelson",
        sourceCollection: "mandelson-batch-1"
      }
    });
    assert.equal(search.statusCode, 200);
    assert.ok(search.json().totals.documents >= 1);
    assert.ok(search.json().totals.claims >= 1);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
