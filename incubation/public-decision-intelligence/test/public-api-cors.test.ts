import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

test("public API CORS allowlist accepts the configured Lovable preview origin", async () => {
  const root = await mkdtemp(join(tmpdir(), "pdi-cors-"));
  const ledgerPath = join(root, "ledger.json");
  const objectStorageDir = join(root, "objects");
  const allowedOrigin = "https://preview--public-decision-intellingence.lovable.app";

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
    PUBLIC_API_ENABLED: "true",
    PUBLIC_API_ALLOWED_ORIGINS: `${allowedOrigin}/,http://127.0.0.1:4174`
  });

  const app = buildApp(env);

  try {
    const optionsResponse = await app.inject({
      method: "OPTIONS",
      url: "/public/api/overview",
      headers: {
        origin: allowedOrigin
      }
    });

    assert.equal(optionsResponse.statusCode, 204);
    assert.equal(optionsResponse.headers["access-control-allow-origin"], allowedOrigin);
    assert.equal(optionsResponse.headers["vary"], "Origin");

    const getResponse = await app.inject({
      method: "GET",
      url: "/public/api/overview",
      headers: {
        origin: allowedOrigin
      }
    });

    assert.equal(getResponse.statusCode, 200);
    assert.equal(getResponse.headers["access-control-allow-origin"], allowedOrigin);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("public API CORS allowlist rejects disallowed origins on preflight", async () => {
  const root = await mkdtemp(join(tmpdir(), "pdi-cors-deny-"));
  const ledgerPath = join(root, "ledger.json");
  const objectStorageDir = join(root, "objects");

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
    PUBLIC_API_ENABLED: "true",
    PUBLIC_API_ALLOWED_ORIGINS: "http://127.0.0.1:4174"
  });

  const app = buildApp(env);

  try {
    const optionsResponse = await app.inject({
      method: "OPTIONS",
      url: "/public/api/overview",
      headers: {
        origin: "https://preview--public-decision-intellingence.lovable.app"
      }
    });

    assert.equal(optionsResponse.statusCode, 403);
    assert.equal(optionsResponse.json().message, "Origin not allowed");
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
