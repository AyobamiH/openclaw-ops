import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

test("Phase 1 document ingest persists lineage, chunks, and citations", async () => {
  const root = await mkdtemp(join(tmpdir(), "pdi-phase1-"));
  const sourceA = join(root, "mandelson-note-v1.txt");
  const sourceB = join(root, "mandelson-note-v2.txt");
  const ledgerPath = join(root, "ledger.json");
  const objectStorageDir = join(root, "objects");

  await writeFile(
    sourceA,
    "Private discussion started on 2004-03-01.\n\nRecommendation moved forward after committee review.",
    "utf8"
  );
  await writeFile(
    sourceB,
    "Private discussion started on 2004-03-01.\n\nRecommendation moved forward after committee review.\n\nFormal appointment announced on 2004-03-09.",
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
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/documents/ingest",
      payload: {
        sourcePath: sourceA,
        logicalSourceKey: "mandelson-batch-1/appointment-note",
        sourceType: "memorandum",
        sourceCollection: "mandelson-batch-1",
        title: "Appointment note"
      }
    });

    assert.equal(first.statusCode, 201);
    const firstBody = first.json();
    assert.equal(firstBody.deduplicated, false);
    assert.equal(firstBody.document.logicalSourceKey, "mandelson-batch-1/appointment-note");
    assert.ok(firstBody.chunkCount > 0);
    assert.equal(firstBody.chunkCount, firstBody.citationCount);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/documents/ingest",
      payload: {
        sourcePath: sourceA,
        logicalSourceKey: "mandelson-batch-1/appointment-note",
        sourceType: "memorandum",
        sourceCollection: "mandelson-batch-1",
        title: "Appointment note"
      }
    });

    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.json().deduplicated, true);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/documents/ingest",
      payload: {
        sourcePath: sourceB,
        logicalSourceKey: "mandelson-batch-1/appointment-note",
        sourceType: "memorandum",
        sourceCollection: "mandelson-batch-1",
        title: "Appointment note revised"
      }
    });

    assert.equal(second.statusCode, 201);
    const secondBody = second.json();
    assert.equal(secondBody.document.supersedesDocumentId, firstBody.document.documentId);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/documents"
    });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().count, 2);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/documents/${secondBody.document.documentId}`
    });
    assert.equal(detail.statusCode, 200);
    const detailBody = detail.json();
    assert.equal(detailBody.lineage.length, 2);
    assert.ok(detailBody.chunks.length > 0);
    assert.ok(detailBody.citations.length > 0);

    const health = await app.inject({
      method: "GET",
      url: "/health"
    });
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().counts.documents, 2);

    const ledger = JSON.parse(await readFile(ledgerPath, "utf8")) as {
      documents: Array<{ documentId: string }>;
      chunks: unknown[];
      citations: unknown[];
    };
    assert.equal(ledger.documents.length, 2);
    assert.ok(ledger.chunks.length > 0);
    assert.ok(ledger.citations.length > 0);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
