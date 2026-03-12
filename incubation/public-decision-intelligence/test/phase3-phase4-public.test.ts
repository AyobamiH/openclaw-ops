import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

test("Phase 3 + Phase 4 support decision chains, review, publication, and public browse", async () => {
  const root = await mkdtemp(join(tmpdir(), "pdi-phase34-"));
  const source = join(root, "mandelson-decision-chain.txt");
  const ledgerPath = join(root, "ledger.json");
  const objectStorageDir = join(root, "objects");

  await writeFile(
    source,
    [
      "Peter Mandelson met with Sarah White on 2004-03-01 at the Cabinet Office.",
      "Sarah White recommended Peter Mandelson for the ambassador role in an email.",
      "The Cabinet Office committee review approved the appointment on 2004-03-09.",
      "An announcement stated the appointment publicly on 2004-03-10."
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
    PUBLIC_API_ENABLED: "true"
  });

  const app = buildApp(env);

  try {
    const ingest = await app.inject({
      method: "POST",
      url: "/api/v1/documents/ingest",
      payload: {
        sourcePath: source,
        logicalSourceKey: "mandelson-batch-1/decision-1",
        sourceType: "evidence-pack",
        sourceCollection: "mandelson-batch-1",
        title: "Decision chain pack"
      }
    });

    assert.equal(ingest.statusCode, 201);
    const ingestBody = ingest.json();
    assert.ok(ingestBody.decisionChainCount >= 1);

    const chains = await app.inject({ method: "GET", url: "/api/v1/decision-chains?sourceCollection=mandelson-batch-1" });
    assert.equal(chains.statusCode, 200);
    const chainBody = chains.json();
    assert.ok(chainBody.count >= 1);
    const chainId = chainBody.items[0].chain.decisionChainId;
    assert.ok(chainBody.items[0].chain.stages.length >= 5);

    const reviewQueue = await app.inject({ method: "GET", url: "/api/v1/review/queue" });
    assert.equal(reviewQueue.statusCode, 200);
    assert.ok(reviewQueue.json().count >= 1);

    const verify = await app.inject({
      method: "POST",
      url: `/api/v1/review/decision_chain/${chainId}`,
      payload: {
        disposition: "verify",
        reviewer: "Analyst A",
        notes: "Chain structure is adequately supported."
      }
    });
    assert.equal(verify.statusCode, 200);
    assert.equal(verify.json().target.verificationState, "verified");

    const publish = await app.inject({
      method: "POST",
      url: `/api/v1/review/decision_chain/${chainId}`,
      payload: {
        disposition: "publish",
        reviewer: "Analyst A",
        notes: "Publish the chain for public browsing."
      }
    });
    assert.equal(publish.statusCode, 200);
    assert.equal(publish.json().target.status, "published");

    const history = await app.inject({ method: "GET", url: `/api/v1/review/history?targetType=decision_chain&targetId=${chainId}` });
    assert.equal(history.statusCode, 200);
    assert.equal(history.json().count, 2);

    const publicOverview = await app.inject({ method: "GET", url: "/public/api/overview" });
    assert.equal(publicOverview.statusCode, 200);
    assert.equal(publicOverview.json().previewMode, false);
    assert.ok(publicOverview.json().counts.publishedDecisionChains >= 1);

    const publicChains = await app.inject({ method: "GET", url: "/public/api/decision-chains" });
    assert.equal(publicChains.statusCode, 200);
    assert.equal(publicChains.json().previewMode, false);
    assert.ok(publicChains.json().count >= 1);

    const publicChain = await app.inject({ method: "GET", url: `/public/api/decision-chains/${chainId}` });
    assert.equal(publicChain.statusCode, 200);
    assert.equal(publicChain.json().chain.status, "published");

    const browse = await app.inject({ method: "GET", url: "/browse" });
    assert.equal(browse.statusCode, 200);
    assert.match(browse.body, /Browse evidence, entities, and decision chains/);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
