import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Telemetry } from "../../shared/telemetry.js";

interface DriftRepairPayload {
  id: string;
  docPaths: string[];
  targetAgents: string[];
  requestedBy: string;
}

interface AgentConfig {
  id?: string;
  docsPath: string;
  cookbookPath?: string;
  knowledgePackDir: string;
  agentsRootPath?: string;
  orchestratorConfigPath?: string;
}

interface ConfigAuditIssue {
  severity: "critical" | "warning";
  scope: string;
  message: string;
}

interface ConfigAudit {
  checkedAt: string;
  summary: {
    totalAgents: number;
    validAgents: number;
    missingIds: number;
    missingOrchestratorTask: number;
    totalIssues: number;
    criticalIssues: number;
  };
  issues: ConfigAuditIssue[];
  discoveredAgentIds: string[];
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

const KNOWLEDGE_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".py",
  ".js",
  ".cjs",
  ".mjs",
  ".ts",
  ".tsx",
  ".html",
  ".css",
  ".scss",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".sh",
  ".sql",
]);

const KNOWLEDGE_BASENAMES = new Set([
  "license",
  "makefile",
  "dockerfile",
  "justfile",
  "procfile",
  ".funcignore",
  ".gitignore",
]);

const IGNORED_KNOWLEDGE_DIRECTORIES = new Set([
  "__pycache__",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "data",
  "datasets",
  "images",
  "image",
  "input_images",
  "output_images",
  "outputs",
  "audio",
  "video",
]);

function isIgnoredKnowledgeDirectory(segment: string): boolean {
  const normalizedSegment = segment.toLowerCase();
  return (
    normalizedSegment.startsWith(".") ||
    normalizedSegment === "results" ||
    normalizedSegment.startsWith("results_") ||
    IGNORED_KNOWLEDGE_DIRECTORIES.has(normalizedSegment)
  );
}

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
    agentsRootPath: resolve(dirname(configPath), parsed.agentsRootPath || "../../agents"),
    orchestratorConfigPath: resolve(
      dirname(configPath),
      parsed.orchestratorConfigPath || "../../orchestrator_config.json"
    ),
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runConfigAudit(task: DriftRepairPayload, config: AgentConfig): Promise<ConfigAudit> {
  const issues: ConfigAuditIssue[] = [];
  const discoveredAgentIds: string[] = [];
  let totalAgents = 0;
  let validAgents = 0;
  let missingIds = 0;
  let missingOrchestratorTask = 0;

  const docsExists = await pathExists(config.docsPath);
  if (!docsExists) {
    issues.push({
      severity: "critical",
      scope: "doc-specialist",
      message: `Configured docsPath does not exist: ${config.docsPath}`,
    });
  }

  if (config.cookbookPath) {
    const cookbookExists = await pathExists(config.cookbookPath);
    if (!cookbookExists) {
      issues.push({
        severity: "warning",
        scope: "doc-specialist",
        message: `Configured cookbookPath does not exist: ${config.cookbookPath}`,
      });
    }
  }

  const orchestratorConfigExists = await pathExists(config.orchestratorConfigPath || "");
  if (!orchestratorConfigExists) {
    issues.push({
      severity: "warning",
      scope: "orchestrator",
      message: `orchestrator config not found at: ${config.orchestratorConfigPath}`,
    });
  }

  try {
    const agentDirs = await readdir(config.agentsRootPath || "");
    for (const agentDir of agentDirs) {
      if (agentDir.startsWith(".") || agentDir === "shared" || agentDir === "README.md") continue;

      const agentConfigPath = resolve(config.agentsRootPath!, agentDir, "agent.config.json");
      const hasConfig = await pathExists(agentConfigPath);
      if (!hasConfig) continue;

      totalAgents++;

      try {
        const raw = await readFile(agentConfigPath, "utf-8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const id = typeof parsed.id === "string" ? parsed.id : "";
        const orchestratorTask = typeof parsed.orchestratorTask === "string" ? parsed.orchestratorTask : "";

        if (!id) {
          missingIds++;
          issues.push({
            severity: "critical",
            scope: `agent:${agentDir}`,
            message: `Missing required id in ${agentConfigPath}`,
          });
        } else {
          discoveredAgentIds.push(id);
        }

        if (!orchestratorTask) {
          missingOrchestratorTask++;
          issues.push({
            severity: "warning",
            scope: `agent:${agentDir}`,
            message: `No orchestratorTask declared in ${agentConfigPath}`,
          });
        }

        if (id) {
          validAgents++;
        }
      } catch (error) {
        issues.push({
          severity: "critical",
          scope: `agent:${agentDir}`,
          message: `Invalid JSON config at ${agentConfigPath}: ${(error as Error).message}`,
        });
      }
    }
  } catch (error) {
    issues.push({
      severity: "critical",
      scope: "doc-specialist",
      message: `Unable to scan agents root path ${config.agentsRootPath}: ${(error as Error).message}`,
    });
  }

  for (const target of task.targetAgents) {
    if (!discoveredAgentIds.includes(target)) {
      issues.push({
        severity: "warning",
        scope: "drift-repair",
        message: `Target agent '${target}' not found in discovered agent IDs`,
      });
    }
  }

  const criticalIssues = issues.filter((issue) => issue.severity === "critical").length;

  return {
    checkedAt: new Date().toISOString(),
    summary: {
      totalAgents,
      validAgents,
      missingIds,
      missingOrchestratorTask,
      totalIssues: issues.length,
      criticalIssues,
    },
    issues,
    discoveredAgentIds,
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

function shouldIgnoreKnowledgePath(relativePath: string): boolean {
  const segments = relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());

  for (const segment of segments.slice(0, -1)) {
    if (isIgnoredKnowledgeDirectory(segment)) {
      return true;
    }
  }

  return false;
}

function shouldIncludeKnowledgeFile(filePath: string, relativePath: string): boolean {
  if (shouldIgnoreKnowledgePath(relativePath)) {
    return false;
  }

  const normalizedBasename = basename(filePath).toLowerCase();
  if (KNOWLEDGE_BASENAMES.has(normalizedBasename)) {
    return true;
  }

  const extension = extname(filePath).toLowerCase();
  return KNOWLEDGE_EXTENSIONS.has(extension);
}

async function findKnowledgeFiles(
  dir: string,
  prefix = "",
): Promise<Array<{ path: string; absolutePath: string }>> {
  const results: Array<{ path: string; absolutePath: string }> = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = resolve(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (isIgnoredKnowledgeDirectory(entry.name)) {
          continue;
        }

        const subFiles = await findKnowledgeFiles(absolutePath, relativePath);
        results.push(...subFiles);
      } else if (shouldIncludeKnowledgeFile(entry.name, relativePath)) {
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
  const knowledgeFiles = await findKnowledgeFiles(docsPath);

  for (const file of knowledgeFiles) {
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

function dedupeSummaries(summaries: ProcessedDocSummary[]): ProcessedDocSummary[] {
  const seen = new Set<string>();
  const deduped: ProcessedDocSummary[] = [];

  for (const summary of summaries) {
    const key = summary.absolutePath || `${summary.source}:${summary.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(summary);
  }

  return deduped;
}

async function generateKnowledgePack(task: DriftRepairPayload, config: AgentConfig) {
  await telemetry.info("pack.start", { files: task.docPaths.length, useDualSources: !!config.cookbookPath });
  const configAudit = await runConfigAudit(task, config);
  const targetedDocs =
    task.docPaths && task.docPaths.length > 0
      ? await collectDocSummaries(task.docPaths, config.docsPath)
      : [];
  const openclawDocs = await collectDocsFromPath(config.docsPath, "openclaw");
  const cookbookDocs = config.cookbookPath
    ? await collectDocsFromPath(config.cookbookPath, "openai")
    : [];
  const summaries = dedupeSummaries([
    ...targetedDocs,
    ...openclawDocs,
    ...cookbookDocs,
  ]);

  await mkdir(config.knowledgePackDir, { recursive: true });
  const packId = `knowledge-pack-${Date.now()}`;
  const packPath = resolve(config.knowledgePackDir, `${packId}.json`);
  const payload = {
    id: packId,
    generatedAt: new Date().toISOString(),
    taskId: task.id,
    requestedBy: task.requestedBy,
    targetAgents: task.targetAgents,
    configAudit,
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
    configAuditIssues: configAudit.summary.totalIssues,
    configAuditCriticalIssues: configAudit.summary.criticalIssues,
  });

  const resultFile = process.env.DOC_SPECIALIST_RESULT_FILE;
  if (resultFile) {
    await writeFile(
      resultFile,
      JSON.stringify(
        {
          packPath,
          packId,
          docsProcessed: summaries.length,
          sourceBreakdown,
          configAuditSummary: configAudit.summary,
        },
        null,
        2
      ),
      "utf-8",
    );
  }

  return { packPath, packId, docsProcessed: summaries.length, sourceBreakdown, configAudit };
}

async function run() {
  if (
    process.env.ALLOW_ORCHESTRATOR_TASK_RUN !== "true" &&
    process.env.ALLOW_DIRECT_TASK_RUN !== "true"
  ) {
    throw new Error(
      "Direct task execution is disabled. Use the orchestrator spawn path or set ALLOW_DIRECT_TASK_RUN=true for a reviewed manual run."
    );
  }

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
    configAuditIssues: pack.configAudit.summary.totalIssues,
    configAuditCriticalIssues: pack.configAudit.summary.criticalIssues,
    targets: task.targetAgents,
    requestedBy: task.requestedBy,
  });
}

run().catch(async (error) => {
  await telemetry.error("task.failed", { message: (error as Error).message });
  process.exit(1);
});
