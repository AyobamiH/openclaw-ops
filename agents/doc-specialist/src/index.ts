import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
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
  cookbookPath?: string;
  knowledgePackDir: string;
}

interface ProcessedDocSummary {
  source: "openclaw" | "openai";
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
    cookbookPath: parsed.cookbookPath ? resolve(dirname(configPath), parsed.cookbookPath) : undefined,
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

async function findMarkdownFiles(
  dir: string,
  prefix = "",
): Promise<Array<{ path: string; absolutePath: string }>> {
  const results: Array<{ path: string; absolutePath: string }> = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const absolutePath = resolve(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        const subFiles = await findMarkdownFiles(absolutePath, relativePath);
        results.push(...subFiles);
      } else if (entry.name.endsWith(".md")) {
        results.push({ path: relativePath, absolutePath });
      }
    }
  } catch (error) {
    await telemetry.warn("dir.scan_failed", {
      dir,
      message: (error as Error).message,
    });
  }

  return results;
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
        source: "openclaw",
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

async function collectDocsFromPath(
  docsPath: string,
  source: "openclaw" | "openai",
): Promise<ProcessedDocSummary[]> {
  const summaries: ProcessedDocSummary[] = [];
  const mdFiles = await findMarkdownFiles(docsPath);

  for (const file of mdFiles) {
    try {
      const content = await readFile(file.absolutePath, "utf-8");
      const summary = summarize(content);
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      const bytes = Buffer.byteLength(content, "utf-8");
      summaries.push({
        source,
        path: file.path,
        absolutePath: file.absolutePath,
        summary,
        wordCount,
        bytes,
        firstHeading: extractHeading(content),
      });
    } catch (error) {
      await telemetry.warn("doc.read_failed", {
        path: file.path,
        source,
        message: (error as Error).message,
      });
    }
  }

  return summaries;
}

async function generateKnowledgePack(task: DriftRepairPayload, config: AgentConfig) {
  await telemetry.info("pack.start", { files: task.docPaths.length, useDualSources: !!config.cookbookPath });
  
  let summaries: ProcessedDocSummary[] = [];

  // If custom docPaths provided, use those (backward compatibility)
  if (task.docPaths && task.docPaths.length > 0) {
    summaries = await collectDocSummaries(task.docPaths, config.docsPath);
  } else {
    // Otherwise, scan both openclaw docs and openai cookbook
    const openclawDocs = await collectDocsFromPath(config.docsPath, "openclaw");
    summaries.push(...openclawDocs);

    if (config.cookbookPath) {
      const cookbookDocs = await collectDocsFromPath(config.cookbookPath, "openai");
      summaries.push(...cookbookDocs);
    }
  }

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
  const sourceBreakdown = summaries.reduce((acc, doc) => {
    acc[doc.source] = (acc[doc.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  await telemetry.info("pack.complete", { 
    packPath, 
    docsProcessed: summaries.length,
    sourceBreakdown,
  });

  const resultFile = process.env.DOC_SPECIALIST_RESULT_FILE;
  if (resultFile) {
    await writeFile(
      resultFile,
      JSON.stringify({ packPath, packId, docsProcessed: summaries.length, sourceBreakdown }, null, 2),
      "utf-8",
    );
  }

  return { packPath, packId, docsProcessed: summaries.length, sourceBreakdown };
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
