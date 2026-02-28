import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Telemetry } from "../../shared/telemetry.js";

interface AgentConfig {
  docsPath: string;
  knowledgePackDir: string;
  orchestratorStatePath: string;
  serviceStatePath: string;
}

interface OrchestratorState {
  pendingDocChanges?: string[];
  driftRepairs?: Array<Record<string, unknown>>;
  lastDriftRepairAt?: string | null;
}

const telemetry = new Telemetry({ component: "doc-specialist-service" });
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function assertServiceBoundary() {
  if (process.env.ALLOW_DIRECT_SERVICE !== "true") {
    throw new Error("Direct service execution blocked. Set ALLOW_DIRECT_SERVICE=true for system-managed runs.");
  }
}

async function loadConfig(): Promise<AgentConfig> {
  const configPath = resolve(__dirname, "../agent.config.json");
  const raw = await readFile(configPath, "utf-8");
  const parsed = JSON.parse(raw) as AgentConfig;
  return {
    docsPath: resolve(dirname(configPath), parsed.docsPath),
    knowledgePackDir: resolve(dirname(configPath), parsed.knowledgePackDir),
    orchestratorStatePath: resolve(dirname(configPath), parsed.orchestratorStatePath),
    serviceStatePath: resolve(dirname(configPath), parsed.serviceStatePath),
  };
}

function summarize(content: string, maxChars = 600) {
  const collapsed = content.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) return collapsed;
  return `${collapsed.slice(0, maxChars)}…`;
}

function extractHeading(content: string) {
  const match = content.match(/^#\s+(.+)$/m) ?? content.match(/^##\s+(.+)$/m);
  return match ? match[1].trim() : undefined;
}

async function readDoc(path: string) {
  const raw = await readFile(path, "utf-8");
  return {
    path,
    summary: summarize(raw),
    wordCount: raw.split(/\s+/).filter(Boolean).length,
    bytes: Buffer.byteLength(raw, "utf-8"),
    firstHeading: extractHeading(raw),
  };
}

async function loadState(path: string): Promise<OrchestratorState> {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as OrchestratorState;
}

async function saveState(path: string, state: OrchestratorState) {
  await writeFile(path, JSON.stringify(state, null, 2), "utf-8");
}

async function loadServiceState(path: string): Promise<{ lastRunAt?: string }>
{
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as { lastRunAt?: string };
  } catch {
    return {};
  }
}

async function saveServiceState(path: string, state: { lastRunAt?: string }) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), "utf-8");
}

async function runOnce(config: AgentConfig) {
  const state = await loadState(config.orchestratorStatePath);
  const pending = state.pendingDocChanges ?? [];
  if (!pending.length) {
    return;
  }

  await telemetry.info("drift.start", { count: pending.length });

  const docs = [] as Array<Record<string, unknown>>;
  for (const docPath of pending) {
    const absolute = resolve(config.docsPath, docPath.replace(/^\.\//, ""));
    try {
      docs.push(await readDoc(absolute));
    } catch (error) {
      await telemetry.warn("doc.read_failed", { path: docPath, message: (error as Error).message });
    }
  }

  await mkdir(config.knowledgePackDir, { recursive: true });
  const packId = `knowledge-pack-${Date.now()}`;
  const packPath = resolve(config.knowledgePackDir, `${packId}.json`);
  await writeFile(
    packPath,
    JSON.stringify({ id: packId, generatedAt: new Date().toISOString(), docs }, null, 2),
    "utf-8",
  );

  state.pendingDocChanges = [];
  state.driftRepairs = [...(state.driftRepairs ?? []), {
    runId: packId,
    requestedBy: "service",
    processedPaths: pending,
    generatedPackIds: [packId],
    packPaths: [packPath],
    docsProcessed: docs.length,
    updatedAgents: ["doc-doctor"],
    durationMs: 0,
    completedAt: new Date().toISOString(),
  }];
  state.lastDriftRepairAt = new Date().toISOString();
  await saveState(config.orchestratorStatePath, state);

  await telemetry.info("drift.complete", { packPath, docsProcessed: docs.length });
}

async function loop() {
  assertServiceBoundary();
  const config = await loadConfig();
  while (true) {
    try {
      await runOnce(config);
      await saveServiceState(config.serviceStatePath, { lastRunAt: new Date().toISOString() });
    } catch (error) {
      await telemetry.error("service.error", { message: (error as Error).message });
    }
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
}

loop().catch(async (error) => {
  await telemetry.error("service.fatal", { message: (error as Error).message });
  process.exit(1);
});
