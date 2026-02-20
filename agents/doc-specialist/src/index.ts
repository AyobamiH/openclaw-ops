import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Telemetry } from "../../shared/telemetry.js";

interface DriftRepairPayload {
  id: string;
  docPaths: string[];
  targetAgents: string[];
  requestedBy: string;
}

interface AgentConfig {
  docsPath: string;
  knowledgePackDir: string;
}

interface ProcessedDocSummary {
  path: string;
  absolutePath: string;
  summary: string;
  wordCount: number;
  bytes: number;
  firstHeading?: string;
}

const telemetry = new Telemetry({ component: "doc-specialist" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadAgentConfig(): Promise<AgentConfig> {
  const configPath = resolve(__dirname, "../agent.config.json");
  const raw = await readFile(configPath, "utf-8");
  const parsed = JSON.parse(raw) as AgentConfig;
  if (!parsed.docsPath || !parsed.knowledgePackDir) {
    throw new Error("agent.config.json must include docsPath and knowledgePackDir");
  }
  return {
    docsPath: resolve(dirname(configPath), parsed.docsPath),
    knowledgePackDir: resolve(dirname(configPath), parsed.knowledgePackDir),
  };
}

function normalizeDocPath(docPath: string, docsRoot: string) {
  if (!docPath) return null;
  const trimmed = docPath.replace(/^\.\//, "");
  if (trimmed.startsWith(docsRoot)) {
    return trimmed;
  }
  return resolve(docsRoot, trimmed);
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

async function collectDocSummaries(docPaths: string[], docsRoot: string): Promise<ProcessedDocSummary[]> {
  const summaries: ProcessedDocSummary[] = [];
  const seen = new Set<string>();

  for (const originalPath of docPaths) {
    if (!originalPath) continue;
    if (seen.has(originalPath)) continue;
    seen.add(originalPath);

    const absolute = normalizeDocPath(originalPath, docsRoot);
    if (!absolute) continue;

    try {
      const content = await readFile(absolute, "utf-8");
      const summary = summarize(content);
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      const bytes = Buffer.byteLength(content, "utf-8");
      summaries.push({
        path: relative(docsRoot, absolute),
        absolutePath: absolute,
        summary,
        wordCount,
        bytes,
        firstHeading: extractHeading(content),
      });
    } catch (error) {
      await telemetry.warn("doc.read_failed", {
        path: originalPath,
        message: (error as Error).message,
      });
    }
  }

  return summaries;
}

async function generateKnowledgePack(task: DriftRepairPayload, config: AgentConfig) {
  await telemetry.info("pack.start", { files: task.docPaths.length });
  const summaries = await collectDocSummaries(task.docPaths, config.docsPath);

  await mkdir(config.knowledgePackDir, { recursive: true });
  const packId = `knowledge-pack-${Date.now()}`;
  const packPath = resolve(config.knowledgePackDir, `${packId}.json`);
  const payload = {
    id: packId,
    generatedAt: new Date().toISOString(),
    taskId: task.id,
    requestedBy: task.requestedBy,
    targetAgents: task.targetAgents,
    docs: summaries,
  };

  await writeFile(packPath, JSON.stringify(payload, null, 2), "utf-8");
  await telemetry.info("pack.complete", { packPath, docsProcessed: summaries.length });

  const resultFile = process.env.DOC_SPECIALIST_RESULT_FILE;
  if (resultFile) {
    await writeFile(
      resultFile,
      JSON.stringify({ packPath, packId, docsProcessed: summaries.length }, null, 2),
      "utf-8",
    );
  }

  return { packPath, packId, docsProcessed: summaries.length };
}

async function run() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    throw new Error("Usage: tsx src/index.ts <payload.json>");
  }

  const raw = await readFile(payloadPath, "utf-8");
  const task = JSON.parse(raw) as DriftRepairPayload;
  await telemetry.info("task.received", { id: task.id, files: task.docPaths.length });

  const config = await loadAgentConfig();
  const pack = await generateKnowledgePack(task, config);

  await telemetry.info("task.success", {
    id: task.id,
    packPath: pack.packPath,
    packId: pack.packId,
    docsProcessed: pack.docsProcessed,
    targets: task.targetAgents,
    requestedBy: task.requestedBy,
  });
}

run().catch(async (error) => {
  await telemetry.error("task.failed", { message: (error as Error).message });
  process.exit(1);
});
