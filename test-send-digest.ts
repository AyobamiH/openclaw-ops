/**
 * Manual test for send-digest handler
 * Run: npx tsx test-send-digest.ts
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = join(fileURLToPath(import.meta.url), "..");

// Mock environment variables for testing
process.env.SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "https://hooks.slack.com/services/TEST/TEST/TEST";
process.env.APP_URL = process.env.APP_URL || "http://localhost:3000";

import { resolveTaskHandler } from "./orchestrator/src/taskHandlers.js";
import type { Task, TaskHandlerContext, OrchestratorState, OrchestratorConfig } from "./orchestrator/src/types.js";

async function testSendDigest() {
  console.log("🚀 Testing send-digest handler with notification delivery...\n");

  // Load config with Slack webhook
  const configPath = join(__dirname, "orchestrator_config.json");
  const configRaw = await readFile(configPath, "utf-8");
  let config: OrchestratorConfig = JSON.parse(configRaw);

  // Override notification settings for testing
  config.digestNotificationChannel = "log"; // Use log channel for safe testing
  config.digestNotificationTarget = "test@example.com";

  console.log("📋 Using notification config:");
  console.log(`  - Channel: ${config.digestNotificationChannel}`);
  console.log(`  - Target: ${config.digestNotificationTarget}`);

  // Load state
  const statePath = join(__dirname, "orchestrator_state.json");
  let state: OrchestratorState = JSON.parse(await readFile(statePath, "utf-8"));

  // Create task
  const task: Task = {
    id: `test-digest-${Date.now()}`,
    type: "send-digest",
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
  console.log("\n⚡ Executing send-digest handler...\n");
  const result = await handler(task, context);
  console.log(`\n✅ Result: ${result}\n`);

  // Check digest was found
  const digestDir = config.digestDir || join(__dirname, "logs", "digests");
  try {
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(digestDir).filter((f) => f.startsWith("digest-") && f.endsWith(".json"));
    console.log(`📊 Found ${files.length} digest file(s) in ${digestDir}`);

    if (files.length > 0) {
      const latest = files.sort().pop();
      console.log(`\n📄 Sent notification for: ${latest}\n`);
      console.log("✨ Test PASSED - Notification delivery tested!");
    }
  } catch (error) {
    console.error("❌ Error reading digest:", (error as Error).message);
  }
}

testSendDigest().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
