import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Telemetry } from "../../shared/telemetry.js";
import {
  loadRuntimeState,
  summarizeProofTransport,
  summarizeTaskExecutions,
  type RuntimeStateSubset,
} from "../../shared/runtime-evidence.js";

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
  stateFile?: string;
  orchestratorStatePath?: string;
  agentsRootPath?: string;
  orchestratorConfigPath?: string;
}

interface RuntimeTruthSummary {
  generatedAt: string;
  taskExecutions: ReturnType<typeof summarizeTaskExecutions>;
  openIncidentCount: number;
  criticalIncidentCount: number;
  relationshipObservationCount: number;
  proofDelivery: {
    milestone: ReturnType<typeof summarizeProofTransport>;
    demandSummary: ReturnType<typeof summarizeProofTransport>;
  };
}

interface RuntimeState extends RuntimeStateSubset {}

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

interface TargetBrief {
  agentId: string;
  objective: string;
  sourceFocus: Array<"openclaw" | "openai">;
  contradictionFocus: string[];
  suggestedActions: string[];
}

interface IncidentPack {
  incidentId: string;
  severity: string;
  summary: string;
  affectedSurfaces: string[];
  recommendedSteps: string[];
}

interface RepairLoopSummary {
  status: "clear" | "watching" | "repair-needed";
  recommendedTaskType: "drift-repair" | "qa-verification" | "system-monitor";
  contradictions: string[];
  staleSignals: string[];
  nextActions: string[];
}

const telemetry = new Telemetry({ component: "doc-specialist" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const KNOWLEDGE_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".ipynb",
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

const HARD_IGNORED_KNOWLEDGE_DIRECTORIES = new Set([
  "__pycache__",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);

const ASSET_MANIFEST_DIRECTORIES = new Set([
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

const BINARY_ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".bmp",
  ".ico",
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".flac",
  ".mp4",
  ".mov",
  ".webm",
  ".avi",
  ".mkv",
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".zip",
  ".tar",
  ".gz",
  ".parquet",
  ".feather",
  ".avro",
  ".rdb",
]);

function isIgnoredKnowledgeDirectory(segment: string): boolean {
  const normalizedSegment = segment.toLowerCase();
  return (
    normalizedSegment.startsWith(".") ||
    HARD_IGNORED_KNOWLEDGE_DIRECTORIES.has(normalizedSegment)
  );
}

function isAssetManifestDirectory(segment: string): boolean {
  const normalizedSegment = segment.toLowerCase();
  return (
    normalizedSegment === "results" ||
    normalizedSegment.startsWith("results_") ||
    ASSET_MANIFEST_DIRECTORIES.has(normalizedSegment)
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
    stateFile: parsed.stateFile ? resolve(dirname(configPath), parsed.stateFile) : undefined,
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

        if (isAssetManifestDirectory(entry.name)) {
          results.push({
            path: `${relativePath}/.asset-manifest.md`,
            absolutePath: `${absolutePath}#asset-manifest`,
          });
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

function createNotebookSummary(content: string) {
  try {
    const parsed = JSON.parse(content) as {
      cells?: Array<{ cell_type?: string; source?: string[] | string; outputs?: unknown[] }>;
      metadata?: Record<string, unknown>;
      nbformat?: number;
      nbformat_minor?: number;
    };
    const cells = Array.isArray(parsed.cells) ? parsed.cells : [];
    const markdownCount = cells.filter((cell) => cell.cell_type === "markdown").length;
    const codeCount = cells.filter((cell) => cell.cell_type === "code").length;
    const outputCount = cells.reduce(
      (count, cell) => count + (Array.isArray(cell.outputs) ? cell.outputs.length : 0),
      0,
    );
    const previews = cells
      .slice(0, 10)
      .map((cell, index) => {
        const raw = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source ?? "");
        const preview = raw.replace(/\s+/g, " ").trim().slice(0, 220);
        return `[cell ${index} | ${cell.cell_type ?? "unknown"}] ${preview}`;
      })
      .filter(Boolean);
    const metadataKeys = Object.keys(parsed.metadata ?? {}).slice(0, 8);
    const summary = [
      `Notebook with ${cells.length} cells (${markdownCount} markdown, ${codeCount} code, ${outputCount} output blocks).`,
      metadataKeys.length > 0 ? `Metadata keys: ${metadataKeys.join(", ")}.` : "",
      previews.join(" "),
    ]
      .filter(Boolean)
      .join(" ");
    return {
      summary: summarize(summary, 900),
      wordCount: summary.split(/\s+/).filter(Boolean).length,
      firstHeading: `Notebook (${parsed.nbformat ?? "?"}.${parsed.nbformat_minor ?? "?"})`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback = `Notebook JSON could not be parsed cleanly (${message}).`;
    return {
      summary: fallback,
      wordCount: fallback.split(/\s+/).filter(Boolean).length,
      firstHeading: "Notebook parse fallback",
    };
  }
}

async function createAssetManifestSummary(
  dirPath: string,
  relativePath: string,
): Promise<{ summary: string; wordCount: number; bytes: number; firstHeading?: string }> {
  const extensionCounts = new Map<string, number>();
  const sampleAssets: string[] = [];
  const textClues: string[] = [];
  let totalFiles = 0;
  let totalBytes = 0;

  async function walk(currentDir: string, currentPrefix: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (isIgnoredKnowledgeDirectory(entry.name)) {
        continue;
      }

      const absolute = resolve(currentDir, entry.name);
      const nestedRelative = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(absolute, nestedRelative);
        continue;
      }

      const stats = await stat(absolute);
      totalFiles += 1;
      totalBytes += stats.size;

      const extension = extname(entry.name).toLowerCase() || "(no extension)";
      extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1);

      if (shouldIncludeKnowledgeFile(entry.name, nestedRelative)) {
        if (textClues.length < 10) {
          textClues.push(nestedRelative);
        }
        continue;
      }

      if (BINARY_ASSET_EXTENSIONS.has(extension) && sampleAssets.length < 12) {
        sampleAssets.push(nestedRelative);
      }
    }
  }

  await walk(dirPath, "");

  const topExtensions = Array.from(extensionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([extension, count]) => `${extension}:${count}`);

  const summary = [
    `Asset manifest for ${relativePath}: ${totalFiles} files totaling ${totalBytes} bytes.`,
    topExtensions.length > 0 ? `Top extensions ${topExtensions.join(", ")}.` : "",
    sampleAssets.length > 0 ? `Sample assets: ${sampleAssets.join(", ")}.` : "",
    textClues.length > 0 ? `Embedded text/code clues: ${textClues.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    summary: summarize(summary, 900),
    wordCount: summary.split(/\s+/).filter(Boolean).length,
    bytes: totalBytes,
    firstHeading: `Asset manifest: ${basename(relativePath)}`,
  };
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
      let summary = "";
      let wordCount = 0;
      let bytes = 0;
      let firstHeading: string | undefined;

      if (file.absolutePath.endsWith("#asset-manifest")) {
        const manifest = await createAssetManifestSummary(
          file.absolutePath.slice(0, -"#asset-manifest".length),
          file.path.replace(/\/\.asset-manifest\.md$/, ""),
        );
        summary = manifest.summary;
        wordCount = manifest.wordCount;
        bytes = manifest.bytes;
        firstHeading = manifest.firstHeading;
      } else {
        const content = await readFile(file.absolutePath, "utf-8");
        bytes = Buffer.byteLength(content, "utf-8");
        if (extname(file.absolutePath).toLowerCase() === ".ipynb") {
          const notebook = createNotebookSummary(content);
          summary = notebook.summary;
          wordCount = notebook.wordCount;
          firstHeading = notebook.firstHeading;
        } else {
          summary = summarize(content);
          wordCount = content.split(/\s+/).filter(Boolean).length;
          firstHeading = extractHeading(content);
        }
      }

      summaries.push({
        source,
        path: file.path,
        absolutePath: file.absolutePath,
        summary,
        wordCount,
        bytes,
        firstHeading,
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
  const runtimeState = await loadRuntimeState<RuntimeState>(
    resolve(__dirname, "../agent.config.json"),
    config.stateFile ?? config.orchestratorStatePath,
  );
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
    runtimeTruth: {
      generatedAt: new Date().toISOString(),
      taskExecutions: summarizeTaskExecutions(runtimeState.taskExecutions ?? []),
      openIncidentCount: (runtimeState.incidentLedger ?? []).filter(
        (incident) => incident.status !== "resolved",
      ).length,
      criticalIncidentCount: (runtimeState.incidentLedger ?? []).filter(
        (incident) => incident.status !== "resolved" && incident.severity === "critical",
      ).length,
      relationshipObservationCount: (runtimeState.relationshipObservations ?? []).length,
      proofDelivery: {
        milestone: summarizeProofTransport(runtimeState.milestoneDeliveries ?? []),
        demandSummary: summarizeProofTransport(runtimeState.demandSummaryDeliveries ?? []),
      },
    } satisfies RuntimeTruthSummary,
    incidentPacks: (runtimeState.incidentLedger ?? [])
      .filter((incident) => incident.status !== "resolved")
      .slice(0, 8)
      .map(
        (incident): IncidentPack => ({
          incidentId: incident.incidentId ?? "unknown-incident",
          severity: incident.severity ?? "warning",
          summary: incident.summary ?? "No runtime incident summary recorded.",
          affectedSurfaces: Array.isArray(incident.affectedSurfaces)
            ? incident.affectedSurfaces.slice(0, 6)
            : [],
          recommendedSteps: Array.isArray(incident.recommendedSteps)
            ? incident.recommendedSteps.slice(0, 4)
            : [],
        }),
      ),
    targetBriefs: task.targetAgents.map(
      (agentId): TargetBrief => ({
        agentId,
        objective: `Refresh ${agentId} with the latest repo, runtime, and proof-boundary knowledge pack.`,
        sourceFocus:
          config.cookbookPath && cookbookDocs.length > 0
            ? ["openclaw", "openai"]
            : ["openclaw"],
        contradictionFocus: [
          ...(configAudit.summary.criticalIssues > 0
            ? [`${configAudit.summary.criticalIssues} critical config audit issue(s)`]
            : []),
          ...((runtimeState.incidentLedger ?? [])
            .filter((incident) => incident.status !== "resolved")
            .slice(0, 2)
            .map((incident) => incident.summary ?? "runtime incident present")),
        ],
        suggestedActions: [
          "Review the latest knowledge pack before acting.",
          "Prefer runtime truth over stale docs when conflicts appear.",
          "Escalate unresolved contradictions back through drift-repair.",
        ],
      }),
    ),
    repairLoop: {
      status:
        configAudit.summary.criticalIssues > 0 ||
        (runtimeState.incidentLedger ?? []).some((incident) => incident.status !== "resolved")
          ? "repair-needed"
          : configAudit.summary.totalIssues > 0
            ? "watching"
            : "clear",
      recommendedTaskType:
        configAudit.summary.criticalIssues > 0 ? "drift-repair" : "qa-verification",
      contradictions: [
        ...configAudit.issues.slice(0, 6).map((issue) => issue.message),
      ],
      staleSignals:
        (runtimeState.incidentLedger ?? [])
          .filter((incident) => incident.status !== "resolved")
          .slice(0, 4)
          .map((incident) => incident.summary ?? "runtime signal present"),
      nextActions:
        configAudit.summary.criticalIssues > 0
          ? [
              "Repair critical manifest/config drift first.",
              "Rebuild knowledge pack after drift repair completes.",
              "Run qa-verification against the affected agent surfaces.",
            ]
          : [
              "Keep knowledge pack current while runtime incidents remain open.",
              "Route high-signal contradictions into verifier review.",
            ],
    } satisfies RepairLoopSummary,
    relationships: task.targetAgents.map((agentId) => ({
      from: "agent:doc-specialist",
      to: `agent:${agentId}`,
      relationship: "feeds-agent",
      detail: `doc-specialist refreshed ${agentId} with pack ${packId}.`,
      evidence: [packId, `docs:${summaries.length}`],
      classification: "knowledge-distribution",
    })),
    toolInvocations: [
      {
        toolId: "documentParser",
        detail: "doc-specialist parsed docs, configs, and curated clue files into a knowledge pack.",
        evidence: [
          `docs:${summaries.length}`,
          `openclaw:${openclawDocs.length}`,
          `openai:${cookbookDocs.length}`,
        ],
        classification: "required",
      },
    ],
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
          incidentPacks: payload.incidentPacks,
          targetBriefs: payload.targetBriefs,
          repairLoop: payload.repairLoop,
          relationships: payload.relationships,
          toolInvocations: payload.toolInvocations,
          runtimeTruth: payload.runtimeTruth,
        },
        null,
        2
      ),
      "utf-8",
    );
  }

  return {
    packPath,
    packId,
    docsProcessed: summaries.length,
    sourceBreakdown,
    configAudit,
    incidentPacks: payload.incidentPacks,
    targetBriefs: payload.targetBriefs,
    repairLoop: payload.repairLoop,
    relationships: payload.relationships,
    toolInvocations: payload.toolInvocations,
    runtimeTruth: payload.runtimeTruth,
  };
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
    openIncidents: pack.runtimeTruth.openIncidentCount,
    relationshipObservationCount: pack.runtimeTruth.relationshipObservationCount,
    targets: task.targetAgents,
    requestedBy: task.requestedBy,
  });
}

run().catch(async (error) => {
  await telemetry.error("task.failed", { message: (error as Error).message });
  process.exit(1);
});
