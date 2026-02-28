/**
 * Manual test for nightly-batch handler
 * Run: npx tsx test-nightly-batch.ts
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = join(fileURLToPath(import.meta.url), "..");

// Load orchestrator types and handlers
import { resolveTaskHandler } from "./orchestrator/src/taskHandlers.js";
import type { Task, TaskHandlerContext, OrchestratorState, OrchestratorConfig } from "./orchestrator/src/types.js";

async function testNightlyBatch() {
  console.log("🚀 Testing nightly-batch handler manually...\n");

  // Load config
  const configPath = join(__dirname, "orchestrator_config.json");
  const configRaw = await readFile(configPath, "utf-8");
  const config: OrchestratorConfig = JSON.parse(configRaw);

  // Load state
  const statePath = join(__dirname, "orchestrator_state.json");
  let state: OrchestratorState;
  try {
    const stateRaw = await readFile(statePath, "utf-8");
    state = JSON.parse(stateRaw);
  } catch {
    console.log("⚠️  No existing state, creating empty state...");
    state = {
      lastStartedAt: null,
      updatedAt: null,
      indexedDocs: 0,
      docIndexVersion: 0,
      pendingDocChanges: ["doc-1.md", "doc-2.md"],
      taskHistory: [],
      approvals: [],
      driftRepairs: [],
      redditQueue: [
        {
          id: "queue-1",
          subreddit: "r/test",
          question: "High confidence post",
          score: 0.82,
          tag: "priority",
        } as any,
        {
          id: "queue-2",
          subreddit: "r/test",
          question: "Low confidence post",
          score: 0.45,
          tag: "draft",
        } as any,
      ],
      redditResponses: [],
      agentDeployments: [],
      rssDrafts: [],
      rssSeenIds: [],
      lastDriftRepairAt: null,
      lastRedditResponseAt: null,
      lastAgentDeployAt: null,
      lastRssSweepAt: null,
    };
  }

  console.log("📋 Initial state:");
  console.log(`  - Pending docs: ${state.pendingDocChanges.length}`);
  console.log(`  - Reddit queue: ${state.redditQueue.length} items`);
  state.redditQueue.forEach((item, i) => {
    console.log(`    [${i}] ${item.question} (score: ${item.score})`);
  });

  // Create task
  const task: Task = {
    id: `test-${Date.now()}`,
    type: "nightly-batch",
    payload: { reason: "manual-test" },
    createdAt: Date.now(),
  };

  // Create context
  const context: TaskHandlerContext = {
    config,
    state,
    saveState: async () => {
      state.updatedAt = new Date().toISOString();
      await writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
    },
    logger: console,
  };

  // Resolve and execute handler
  const handler = resolveTaskHandler(task);
  console.log("\n⚡ Executing nightly-batch handler...");
  const result = await handler(task, context);
  console.log(`✅ Result: ${result}\n`);

  // Check digest was created
  const digestDir = config.digestDir || join(__dirname, "logs", "digests");
  await mkdir(digestDir, { recursive: true });

  console.log("📂 Checking digest directory...");
  console.log(`   Path: ${digestDir}`);

  try {
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(digestDir).filter((f) => f.startsWith("digest-") && f.endsWith(".json"));
    console.log(`   Found ${files.length} digest file(s)`);

    if (files.length > 0) {
      const latest = files.sort().pop();
      console.log(`\n📄 Latest digest: ${latest}`);

      const digestPath = join(digestDir, latest!);
      const digestRaw = await readFile(digestPath, "utf-8");
      const digest = JSON.parse(digestRaw);

      console.log("\n📊 Digest summary:");
      console.log(`  - Generated at: ${digest.generatedAt}`);
      console.log(`  - Batch ID: ${digest.batchId}`);
      console.log(`  - Docs processed: ${digest.summary.docsProcessed}`);
      console.log(`  - Queue total: ${digest.summary.queueTotal}`);
      console.log(`  - Marked for draft (score > 0.75): ${digest.summary.markedForDraft}`);
      console.log(`\n📋 Items marked for draft:`);
      digest.redditQueue.forEach((item: any) => {
        console.log(`   - ${item.question} (score: ${item.score}, drafted: ${item.selectedForDraft})`);
      });

      console.log("\n✨ Test PASSED - Digest created successfully!");
    } else {
      console.log("⚠️  No digest files found");
    }
  } catch (error) {
    console.error("❌ Error reading digest:", (error as Error).message);
  }
}

testNightlyBatch().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
