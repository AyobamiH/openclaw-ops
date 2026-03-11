import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  writeFile,
  appendFile,
  mkdtemp,
  rm,
  readdir,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";
import {
  ApprovalRecord,
  AgentDeploymentRecord,
  DriftRepairRecord,
  RepairRecord,
  RedditReplyRecord,
  RedditQueueItem,
  RssDraftRecord,
  Task,
  TaskHandler,
  TaskHandlerContext,
} from "./types.js";
import { sendNotification, buildNotifierConfig } from "./notifier.js";
import { getAgentRegistry } from "./agentRegistry.js";
import { getToolGate } from "./toolGate.js";
import { upsertRepairRecord, updateRepairRecord } from "./state.js";
import { getMilestoneEmitter } from "./milestones/emitter.js";
import type { MilestoneEvent } from "./milestones/schema.js";
import { getDemandSummaryEmitter } from "./demand/emitter.js";
import { buildDemandStateFingerprint } from "./demand/summary-builder.js";
import { onApprovalRequested } from "./metrics/index.js";

// Central task allowlist (deny-by-default enforcement)
export const ALLOWED_TASK_TYPES = [
  "startup",
  "doc-change",
  "doc-sync",
  "drift-repair",
  "reddit-response",
  "security-audit",
  "summarize-content",
  "system-monitor",
  "build-refactor",
  "content-generate",
  "integration-workflow",
  "normalize-data",
  "market-research",
  "data-extraction",
  "qa-verification",
  "skill-audit",
  "rss-sweep",
  "nightly-batch",
  "send-digest",
  "heartbeat",
  "agent-deploy",
] as const;

export type AllowedTaskType = (typeof ALLOWED_TASK_TYPES)[number];

const SPAWNED_AGENT_PERMISSION_REQUIREMENTS: Partial<
  Record<AllowedTaskType, { agentId: string; skillId: string }>
> = {
  "security-audit": { agentId: "security-agent", skillId: "documentParser" },
  "summarize-content": {
    agentId: "summarization-agent",
    skillId: "documentParser",
  },
  "system-monitor": {
    agentId: "system-monitor-agent",
    skillId: "documentParser",
  },
  "build-refactor": {
    agentId: "build-refactor-agent",
    skillId: "workspacePatch",
  },
  "content-generate": { agentId: "content-agent", skillId: "documentParser" },
  "integration-workflow": {
    agentId: "integration-agent",
    skillId: "documentParser",
  },
  "normalize-data": { agentId: "normalization-agent", skillId: "normalizer" },
  "market-research": {
    agentId: "market-research-agent",
    skillId: "sourceFetch",
  },
  "data-extraction": {
    agentId: "data-extraction-agent",
    skillId: "documentParser",
  },
  "qa-verification": {
    agentId: "qa-verification-agent",
    skillId: "testRunner",
  },
  "skill-audit": { agentId: "skill-audit-agent", skillId: "documentParser" },
};

/**
 * Validate task type against allowlist
 * @throws Error if task type is not allowed
 */
export function validateTaskType(
  taskType: string,
): taskType is AllowedTaskType {
  return ALLOWED_TASK_TYPES.includes(taskType as any);
}

const MAX_REDDIT_QUEUE = 100;
const RSS_SEEN_CAP = 400;
const AGENT_MEMORY_TIMELINE_LIMIT = 120;
const DOC_DRIFT_REPAIR_THRESHOLD = 25;
const DOC_DRIFT_REPAIR_COOLDOWN_MS = 15 * 60 * 1000;
const REDDIT_MANUAL_REVIEW_APPROVAL_PREFIX = "reddit-manual-review";
const REDDIT_DRAFT_REVIEW_APPROVAL_PREFIX = "reddit-draft-review";
const REDDIT_DRAFT_APPROVALS_PER_BATCH = 10;
const CHILD_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "NODE_ENV",
  "TZ",
  "LANG",
  "LC_ALL",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

function ensureDocChangeStored(path: string, context: TaskHandlerContext) {
  const { state } = context;
  if (state.pendingDocChanges.includes(path)) return;
  state.pendingDocChanges.unshift(path);
  if (state.pendingDocChanges.length > 200) {
    state.pendingDocChanges.pop();
  }
}

function ensureRedditQueueLimit(context: TaskHandlerContext) {
  if (context.state.redditQueue.length > MAX_REDDIT_QUEUE) {
    context.state.redditQueue.length = MAX_REDDIT_QUEUE;
  }
}

function hasActiveTaskExecution(
  taskType: AllowedTaskType,
  context: TaskHandlerContext,
) {
  return context.state.taskExecutions.some(
    (execution) =>
      execution.type === taskType &&
      (execution.status === "pending" ||
        execution.status === "running" ||
        execution.status === "retrying"),
  );
}

function normalizeDocRepairPaths(paths: string[]) {
  return [...new Set(paths.map((path) => path.trim()).filter(Boolean))].sort();
}

function buildDocRepairFingerprint(paths: string[]) {
  return normalizeDocRepairPaths(paths).join("|");
}

function getRepairReferenceTimestamp(record: RepairRecord) {
  return (
    record.verifiedAt ??
    record.completedAt ??
    record.startedAt ??
    record.queuedAt ??
    record.detectedAt
  );
}

function isDocRepairCoolingDown(
  paths: string[],
  context: TaskHandlerContext,
  nowMs: number = Date.now(),
) {
  const fingerprint = buildDocRepairFingerprint(paths);
  if (!fingerprint) return false;

  return context.state.repairRecords.some((record) => {
    if (record.classification !== "doc-drift") return false;
    if (record.trigger !== "pending-doc-threshold") return false;
    if (buildDocRepairFingerprint(record.affectedPaths ?? []) !== fingerprint) {
      return false;
    }

    const referenceTime = Date.parse(getRepairReferenceTimestamp(record));
    if (!Number.isFinite(referenceTime)) return false;
    return nowMs - referenceTime < DOC_DRIFT_REPAIR_COOLDOWN_MS;
  });
}

function emitMilestoneSafely(event: MilestoneEvent) {
  getMilestoneEmitter()?.emit(event);
}

export function buildAllowlistedChildEnv(
  extraEnv: Record<string, string | undefined>,
): NodeJS.ProcessEnv {
  const orchestratorNodeModules = join(process.cwd(), "node_modules");
  const env: NodeJS.ProcessEnv = {
    ALLOW_ORCHESTRATOR_TASK_RUN: "true",
    NODE_PATH: process.env.NODE_PATH
      ? `${orchestratorNodeModules}${delimiter}${process.env.NODE_PATH}`
      : orchestratorNodeModules,
  };

  for (const key of CHILD_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0) {
      env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(extraEnv)) {
    if (typeof value === "string" && value.length > 0) {
      env[key] = value;
    }
  }

  return env;
}

function queueDepthNextAction(queueTotal: number) {
  if (queueTotal <= 0) {
    return "Queue is clear. Watch for the next high-intent lead.";
  }

  if (queueTotal === 1) {
    return "Route the next queued lead through reddit-response.";
  }

  return `Route the next ${queueTotal} queued leads through reddit-response.`;
}

async function emitDemandSummaryIfChanged(
  previousFingerprint: string,
  context: TaskHandlerContext,
) {
  const emitter = getDemandSummaryEmitter();
  if (!emitter) return;

  const nextFingerprint = buildDemandStateFingerprint(context.state);
  if (previousFingerprint === nextFingerprint) return;

  try {
    await emitter.emit();
  } catch (error) {
    context.logger.warn(
      `[demand-summary] emit failed: ${(error as Error).message}`,
    );
  }
}

function rememberRssId(context: TaskHandlerContext, id: string) {
  if (context.state.rssSeenIds.includes(id)) return;
  context.state.rssSeenIds.unshift(id);
  if (context.state.rssSeenIds.length > RSS_SEEN_CAP) {
    context.state.rssSeenIds.length = RSS_SEEN_CAP;
  }
}

async function runDocSpecialistJob(
  docPaths: string[],
  targetAgents: string[],
  requestedBy: string,
  logger: Console,
) {
  const agentRoot = join(process.cwd(), "..", "agents", "doc-specialist");
  const tmpRoot = await mkdtemp(join(tmpdir(), "docspec-"));
  const payloadPath = join(tmpRoot, "payload.json");
  const resultPath = join(tmpRoot, "result.json");
  const payload = {
    id: randomUUID(),
    type: "drift-repair",
    docPaths,
    targetAgents,
    requestedBy,
  };
  const startedAt = new Date().toISOString();
  await writeFile(payloadPath, JSON.stringify(payload, null, 2), "utf-8");

  try {
    await new Promise<void>((resolve, reject) => {
      const tsxPath = join(
        process.cwd(),
        "node_modules",
        "tsx",
        "dist",
        "cli.mjs",
      );
      const child = spawn(
        process.execPath,
        [tsxPath, "src/index.ts", payloadPath],
        {
          cwd: agentRoot,
          env: buildAllowlistedChildEnv({
            DOC_SPECIALIST_RESULT_FILE: resultPath,
          }),
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 5 * 60 * 1000, // 5 minutes
        },
      );

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.stdout.on("data", (chunk) => {
        logger.log(`[doc-specialist] ${chunk.toString().trim()}`);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              stderr.trim() || `doc-specialist exited with code ${code}`,
            ),
          );
        }
      });
    });

    const raw = await readFile(resultPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      packPath: string;
      packId: string;
      docsProcessed: number;
    };
    await persistSpawnedAgentServiceState(
      "doc-specialist",
      payload,
      "success",
      parsed,
      undefined,
      startedAt,
    );
    return parsed;
  } catch (error) {
    await persistSpawnedAgentServiceState(
      "doc-specialist",
      payload,
      "error",
      undefined,
      toErrorMessage(error),
      startedAt,
    );
    throw error;
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

async function findLatestKnowledgePack(dir?: string) {
  const targetDir = dir ?? join(process.cwd(), "..", "logs", "knowledge-packs");
  try {
    const files = await readdir(targetDir);
    const packFiles = files.filter((file) => file.endsWith(".json"));
    if (!packFiles.length) return null;
    const sorted = await Promise.all(
      packFiles.map(async (file) => {
        const fullPath = join(targetDir, file);
        const stats = await stat(fullPath);
        return { path: fullPath, mtime: stats.mtimeMs };
      }),
    );
    sorted.sort((a, b) => b.mtime - a.mtime);
    const latest = sorted[0];
    const raw = await readFile(latest.path, "utf-8");
    const parsed = JSON.parse(raw);
    return { path: latest.path, pack: parsed };
  } catch (error) {
    return null;
  }
}

async function runRedditHelperJob(
  payload: Record<string, unknown>,
  logger: Console,
) {
  const agentRoot = join(process.cwd(), "..", "agents", "reddit-helper");
  const tmpRoot = await mkdtemp(join(tmpdir(), "reddithelper-"));
  const payloadPath = join(tmpRoot, "payload.json");
  const resultPath = join(tmpRoot, "result.json");
  const enrichedPayload: Record<string, unknown> = {
    type: "reddit-response",
    ...payload,
  };
  const startedAt = new Date().toISOString();
  await writeFile(
    payloadPath,
    JSON.stringify(enrichedPayload, null, 2),
    "utf-8",
  );

  try {
    await new Promise<void>((resolve, reject) => {
      const tsxPath = join(
        process.cwd(),
        "node_modules",
        "tsx",
        "dist",
        "cli.mjs",
      );
      const child = spawn(
        process.execPath,
        [tsxPath, "src/index.ts", payloadPath],
        {
          cwd: agentRoot,
          env: buildAllowlistedChildEnv({
            REDDIT_HELPER_RESULT_FILE: resultPath,
          }),
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 5 * 60 * 1000, // 5 minutes
        },
      );

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.stdout.on("data", (chunk) => {
        logger.log(`[reddit-helper] ${chunk.toString().trim()}`);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              stderr.trim() || `reddit-helper exited with code ${code}`,
            ),
          );
        }
      });
    });

    const raw = await readFile(resultPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      replyText: string;
      confidence: number;
      ctaVariant?: string;
      devvitPayloadPath?: string;
      packId?: string;
      packPath?: string;
    };
    await persistSpawnedAgentServiceState(
      "reddit-helper",
      enrichedPayload,
      "success",
      parsed,
      undefined,
      startedAt,
    );
    return parsed;
  } catch (error) {
    await persistSpawnedAgentServiceState(
      "reddit-helper",
      enrichedPayload,
      "error",
      undefined,
      toErrorMessage(error),
      startedAt,
    );
    throw error;
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

async function runSpawnedAgentJob(
  agentId: string,
  payload: Record<string, unknown>,
  resultEnvVar: string,
  logger: Console,
) {
  const agentRoot = join(process.cwd(), "..", "agents", agentId);
  const tmpRoot = await mkdtemp(join(tmpdir(), `${agentId}-`));
  const payloadPath = join(tmpRoot, "payload.json");
  const resultPath = join(tmpRoot, "result.json");
  const startedAt = new Date().toISOString();
  await writeFile(payloadPath, JSON.stringify(payload, null, 2), "utf-8");

  try {
    await new Promise<void>((resolve, reject) => {
      const tsxPath = join(
        process.cwd(),
        "node_modules",
        "tsx",
        "dist",
        "cli.mjs",
      );
      const child = spawn(
        process.execPath,
        [tsxPath, "src/index.ts", payloadPath],
        {
          cwd: agentRoot,
          env: buildAllowlistedChildEnv({
            [resultEnvVar]: resultPath,
          }),
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 5 * 60 * 1000,
        },
      );

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.stdout.on("data", (chunk) => {
        logger.log(`[${agentId}] ${chunk.toString().trim()}`);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(stderr.trim() || `${agentId} exited with code ${code}`),
          );
        }
      });
    });

    const raw = await readFile(resultPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    await persistSpawnedAgentServiceState(
      agentId,
      payload,
      "success",
      parsed,
      undefined,
      startedAt,
    );
    return parsed;
  } catch (error) {
    const reportedResult = await tryReadSpawnedAgentResult(resultPath);
    const failureMessage =
      reportedResult && reportedResult.success !== true
        ? `${agentId} reported unsuccessful result: ${summarizeSpawnedAgentFailure(reportedResult)}`
        : toErrorMessage(error);
    await persistSpawnedAgentServiceState(
      agentId,
      payload,
      "error",
      undefined,
      failureMessage,
      startedAt,
    );
    throw new Error(failureMessage);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

type SpawnedAgentMemoryConfig = {
  orchestratorStatePath?: string;
  serviceStatePath?: string;
};

async function loadSpawnedAgentMemoryConfig(
  agentId: string,
): Promise<SpawnedAgentMemoryConfig> {
  const configPath = join(
    process.cwd(),
    "..",
    "agents",
    agentId,
    "agent.config.json",
  );
  try {
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as SpawnedAgentMemoryConfig;
    return parsed;
  } catch {
    return {};
  }
}

async function persistSpawnedAgentServiceState(
  agentId: string,
  payload: Record<string, unknown>,
  status: "success" | "error",
  result?: Record<string, unknown>,
  errorMessage?: string,
  startedAt?: string,
) {
  const config = await loadSpawnedAgentMemoryConfig(agentId);
  if (!config.serviceStatePath) return;

  const serviceStatePath = join(
    process.cwd(),
    "..",
    "agents",
    agentId,
    config.serviceStatePath,
  );
  let existing: Record<string, unknown> = {};
  try {
    const current = await readFile(serviceStatePath, "utf-8");
    existing = JSON.parse(current) as Record<string, unknown>;
  } catch {
    existing = {};
  }

  const completedAt = new Date().toISOString();
  const runStartedAt = startedAt ?? completedAt;
  const durationMs = Math.max(
    0,
    new Date(completedAt).getTime() - new Date(runStartedAt).getTime(),
  );

  const timeline = Array.isArray(existing.taskTimeline)
    ? (existing.taskTimeline as Array<Record<string, unknown>>)
    : [];

  const timelineEntry: Record<string, unknown> = {
    taskId: typeof payload.id === "string" ? payload.id : null,
    taskType: typeof payload.type === "string" ? payload.type : null,
    status,
    startedAt: runStartedAt,
    completedAt,
    durationMs,
    error: status === "error" ? (errorMessage ?? null) : null,
    resultSummary:
      status === "success"
        ? {
            success: result?.success ?? true,
            keys: result ? Object.keys(result).slice(0, 12) : [],
          }
        : undefined,
  };

  const nextTimeline = [timelineEntry, ...timeline].slice(
    0,
    AGENT_MEMORY_TIMELINE_LIMIT,
  );
  const successCount =
    Number(existing.successCount ?? 0) + (status === "success" ? 1 : 0);
  const errorCount =
    Number(existing.errorCount ?? 0) + (status === "error" ? 1 : 0);

  const nextState: Record<string, unknown> = {
    ...existing,
    memoryVersion: 2,
    agentId,
    orchestratorStatePath: config.orchestratorStatePath,
    lastRunAt: completedAt,
    lastStatus: status,
    lastTaskId: typeof payload.id === "string" ? payload.id : null,
    lastTaskType: typeof payload.type === "string" ? payload.type : null,
    lastError: status === "error" ? (errorMessage ?? null) : null,
    successCount,
    errorCount,
    totalRuns: successCount + errorCount,
    taskTimeline: nextTimeline,
  };

  if (status === "success") {
    nextState.lastResultSummary = {
      success: result?.success ?? true,
      keys: result ? Object.keys(result).slice(0, 12) : [],
    };
  }

  await mkdir(dirname(serviceStatePath), { recursive: true });
  await writeFile(
    serviceStatePath,
    JSON.stringify(nextState, null, 2),
    "utf-8",
  );
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function throwTaskFailure(taskLabel: string, error: unknown): never {
  throw new Error(`${taskLabel} failed: ${toErrorMessage(error)}`);
}

function summarizeSpawnedAgentFailure(result: Record<string, unknown>) {
  if (typeof result.error === "string" && result.error.trim().length > 0) {
    return result.error.trim();
  }

  if (Array.isArray(result.warnings)) {
    const warnings = result.warnings
      .filter((warning): warning is string => typeof warning === "string")
      .map((warning) => warning.trim())
      .filter(Boolean);
    if (warnings.length > 0) {
      return warnings.join("; ");
    }
  }

  const metrics =
    typeof result.metrics === "object" && result.metrics !== null
      ? (result.metrics as Record<string, unknown>)
      : null;
  if (metrics && Array.isArray(metrics.alerts)) {
    const alerts = metrics.alerts
      .filter((alert): alert is string => typeof alert === "string")
      .map((alert) => alert.trim())
      .filter(Boolean);
    if (alerts.length > 0) {
      return alerts.join("; ");
    }
  }

  const summary =
    typeof result.summary === "object" && result.summary !== null
      ? (result.summary as Record<string, unknown>)
      : null;
  if (summary) {
    if (
      typeof summary.compliance === "string" &&
      summary.compliance.trim().length > 0
    ) {
      return `compliance ${summary.compliance.trim()}`;
    }
    if (typeof summary.total === "number") {
      return `${summary.total} findings reported`;
    }
  }

  return "agent returned unsuccessful result";
}

export function assertSpawnedAgentReportedSuccess(
  result: Record<string, unknown>,
  taskLabel: string,
) {
  if (result.success === true) return;
  throw new Error(
    `${taskLabel} agent reported unsuccessful result: ${summarizeSpawnedAgentFailure(result)}`,
  );
}

export function shouldSelectQueueItemForDraft(
  item: { tag?: string | null } | null | undefined,
) {
  return item?.tag === "priority";
}

export function consumeNextSelectedQueueItem(redditQueue: RedditQueueItem[]) {
  const queueIndex = redditQueue.findIndex(
    (item) => item.selectedForDraft === true,
  );
  if (queueIndex === -1) {
    return null;
  }

  const [selected] = redditQueue.splice(queueIndex, 1);
  return selected ?? null;
}

export function buildRedditQueueItemFromPayload(
  payloadQueue: Record<string, unknown>,
  queuedAt: string,
): RedditQueueItem {
  return {
    id: String(payloadQueue.id ?? randomUUID()),
    subreddit: String(payloadQueue.subreddit ?? "r/OpenClaw"),
    question: String(
      payloadQueue.question ?? "General OpenClaw workflow question",
    ),
    link: payloadQueue.link ? String(payloadQueue.link) : undefined,
    queuedAt,
    selectedForDraft: payloadQueue.selectedForDraft === true,
    tag: typeof payloadQueue.tag === "string" ? payloadQueue.tag : undefined,
    pillar:
      typeof payloadQueue.pillar === "string" ? payloadQueue.pillar : undefined,
    feedId:
      typeof payloadQueue.feedId === "string" ? payloadQueue.feedId : undefined,
    entryContent:
      typeof payloadQueue.entryContent === "string"
        ? payloadQueue.entryContent
        : undefined,
    author:
      typeof payloadQueue.author === "string" ? payloadQueue.author : undefined,
    ctaVariant:
      typeof payloadQueue.ctaVariant === "string"
        ? payloadQueue.ctaVariant
        : undefined,
    matchedKeywords: Array.isArray(payloadQueue.matchedKeywords)
      ? payloadQueue.matchedKeywords.map((item) => String(item))
      : undefined,
    score:
      typeof payloadQueue.score === "number" && Number.isFinite(payloadQueue.score)
        ? payloadQueue.score
        : undefined,
    draftRecordId: payloadQueue.draftRecordId
      ? String(payloadQueue.draftRecordId)
      : undefined,
    suggestedReply:
      typeof payloadQueue.suggestedReply === "string"
        ? payloadQueue.suggestedReply
        : undefined,
  };
}

export function resolveRedditResponseQueueItem(
  redditQueue: RedditQueueItem[],
  payloadQueue: unknown,
  queuedAt: string,
) {
  if (payloadQueue && typeof payloadQueue === "object") {
    return buildRedditQueueItemFromPayload(
      payloadQueue as Record<string, unknown>,
      queuedAt,
    );
  }

  return consumeNextSelectedQueueItem(redditQueue);
}

export function buildManualReviewApprovalTaskId(queueItemId: string) {
  return `${REDDIT_MANUAL_REVIEW_APPROVAL_PREFIX}:${queueItemId}`;
}

export function buildDraftReviewApprovalTaskId(queueItemId: string) {
  return `${REDDIT_DRAFT_REVIEW_APPROVAL_PREFIX}:${queueItemId}`;
}

function isManualReviewQueueItem(
  item: RedditQueueItem | null | undefined,
): item is RedditQueueItem & { tag: "manual-review" } {
  return item?.tag === "manual-review" && typeof item.id === "string";
}

function isDraftQueueItem(
  item: RedditQueueItem | null | undefined,
): item is RedditQueueItem & { tag: "draft" } {
  return item?.tag === "draft" && typeof item.id === "string";
}

function buildManualReviewReplayPayload(queueItem: RedditQueueItem) {
  return {
    queue: {
      ...queueItem,
      selectedForDraft: true,
      reviewSource: "manual-review" as const,
    },
    responder: "reddit-helper",
    reviewSource: "manual-review" as const,
  };
}

function buildDraftReviewReplayPayload(queueItem: RedditQueueItem) {
  return {
    queue: {
      ...queueItem,
      selectedForDraft: true,
      reviewSource: "draft-review" as const,
    },
    responder: "reddit-helper",
    reviewSource: "draft-review" as const,
  };
}

export function ensureManualReviewApprovalRecord(
  approvals: ApprovalRecord[],
  queueItem: RedditQueueItem,
  requestedAt: string,
) {
  if (!isManualReviewQueueItem(queueItem)) {
    return false;
  }

  const taskId = buildManualReviewApprovalTaskId(queueItem.id);
  if (approvals.some((approval) => approval.taskId === taskId)) {
    return false;
  }

  approvals.push({
    taskId,
    type: "reddit-response",
    payload: buildManualReviewReplayPayload(queueItem),
    requestedAt,
    status: "pending",
    note: "Manual-review RSS lead requires explicit operator approval before reddit-response drafting.",
  });
  return true;
}

export function ensureDraftReviewApprovalRecord(
  approvals: ApprovalRecord[],
  queueItem: RedditQueueItem,
  requestedAt: string,
) {
  if (!isDraftQueueItem(queueItem)) {
    return false;
  }

  const taskId = buildDraftReviewApprovalTaskId(queueItem.id);
  if (approvals.some((approval) => approval.taskId === taskId)) {
    return false;
  }

  approvals.push({
    taskId,
    type: "reddit-response",
    payload: buildDraftReviewReplayPayload(queueItem),
    requestedAt,
    status: "pending",
    note: "Draft-tagged RSS lead is queued for optional operator promotion before reddit-response drafting.",
  });
  return true;
}

export function consumeReviewQueueItemForApprovalDecision(
  redditQueue: RedditQueueItem[],
  approval: ApprovalRecord,
) {
  if (approval.type !== "reddit-response") {
    return null;
  }

  const payloadQueue = approval.payload?.queue;
  if (
    !payloadQueue ||
    typeof payloadQueue !== "object" ||
    !["manual-review", "draft-review"].includes(
      String((payloadQueue as { reviewSource?: unknown }).reviewSource ?? ""),
    )
  ) {
    return null;
  }

  const queueId = (payloadQueue as { id?: unknown }).id;
  if (typeof queueId !== "string" || queueId.trim().length === 0) {
    return null;
  }

  const queueIndex = redditQueue.findIndex((item) => item.id === queueId);
  if (queueIndex === -1) {
    return null;
  }

  const [removed] = redditQueue.splice(queueIndex, 1);
  return removed ?? null;
}

async function tryReadSpawnedAgentResult(resultPath: string) {
  try {
    const raw = await readFile(resultPath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function assertToolGatePermission(taskType: AllowedTaskType) {
  const requirement = SPAWNED_AGENT_PERMISSION_REQUIREMENTS[taskType];
  if (!requirement) return;

  const gate = await getToolGate();
  const taskAuthorization = gate.canExecuteTask(requirement.agentId, taskType);
  if (!taskAuthorization.allowed) {
    throw new Error(
      `toolgate denied task ${taskType}: ${taskAuthorization.reason}`,
    );
  }

  const permissionResult = await gate.preflightSkillAccess(
    requirement.agentId,
    requirement.skillId,
    {
      mode: "preflight",
      taskType,
    },
  );

  if (!permissionResult.success) {
    throw new Error(
      `toolgate denied ${requirement.agentId} for skill ${requirement.skillId}: ${permissionResult.error}`,
    );
  }
}

function parseRssEntries(xml: string) {
  const entries: Array<{
    id: string;
    title: string;
    content: string;
    link: string;
    author?: string;
  }> = [];
  const itemRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const idMatch = block.match(/<id>([\s\S]*?)<\/id>/i);
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
    const contentMatch = block.match(/<content[^>]*>([\s\S]*?)<\/content>/i);
    const linkMatch = block.match(/<link[^>]*href="([^"]+)"/i);
    const authorMatch = block.match(
      /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/i,
    );

    const id = idMatch ? stripHtml(idMatch[1]) : randomUUID();
    const title = titleMatch ? stripHtml(titleMatch[1]) : "";
    const content = contentMatch ? stripHtml(contentMatch[1]) : "";
    const link = linkMatch ? linkMatch[1] : "";
    const author = authorMatch ? stripHtml(authorMatch[1]) : undefined;

    if (!title && !content) continue;
    entries.push({ id, title, content, link, author });
  }
  return entries;
}

function buildScore(text: string, clusterKeywords: Record<string, string[]>) {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  const breakdown: Record<string, number> = {};

  Object.entries(clusterKeywords).forEach(([cluster, keywords]) => {
    let count = 0;
    for (const keyword of keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        matched.push(keyword);
        count += 1;
      }
    }
    if (count > 0) {
      breakdown[cluster] = count;
    }
  });

  return { matched, breakdown };
}

async function appendDraft(path: string, record: RssDraftRecord) {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf-8");
}

const startupHandler: TaskHandler = async (_, context) => {
  context.state.lastStartedAt = new Date().toISOString();
  await context.saveState();

  emitMilestoneSafely({
    milestoneId: `orchestrator.started.${context.state.lastStartedAt}`,
    timestampUtc: context.state.lastStartedAt,
    scope: "runtime",
    claim: "Orchestrator started successfully.",
    evidence: [
      {
        type: "log",
        path: context.config.stateFile,
        summary: "lastStartedAt set in orchestrator state",
      },
    ],
    riskStatus: "on-track",
    nextAction: "Monitor task queue for first incoming tasks.",
    source: "orchestrator",
  });

  return "orchestrator boot complete";
};

const docChangeHandler: TaskHandler = async (task, context) => {
  const path = String(task.payload.path ?? "unknown");
  ensureDocChangeStored(path, context);
  let autoRepairTaskId: string | null = null;
  const pendingPaths = [...context.state.pendingDocChanges];
  const driftRepairActive = hasActiveTaskExecution("drift-repair", context);
  const autoRepairCoolingDown =
    pendingPaths.length >= DOC_DRIFT_REPAIR_THRESHOLD &&
    !driftRepairActive &&
    isDocRepairCoolingDown(pendingPaths, context);

  if (
    pendingPaths.length >= DOC_DRIFT_REPAIR_THRESHOLD &&
    !driftRepairActive &&
    !autoRepairCoolingDown
  ) {
    const detectedAt = new Date().toISOString();
    const repairId = `doc-drift:${task.id}`;
    const affectedPaths = pendingPaths;
    const repairTask = context.enqueueTask("drift-repair", {
      requestedBy: "auto-doc-drift-detector",
      paths: affectedPaths,
      targets: ["doc-specialist"],
      notes: `auto-enqueued from doc-change ${task.id}`,
      __repairId: repairId,
    });

    const record: RepairRecord = {
      repairId,
      classification: "doc-drift",
      trigger: "pending-doc-threshold",
      sourceTaskId: task.id,
      sourceTaskType: task.type,
      repairTaskType: "drift-repair",
      repairTaskId: repairTask.id,
      verificationMode: "knowledge-pack",
      status: "queued",
      detectedAt,
      queuedAt: detectedAt,
      affectedPaths,
      evidence: [
        `pending-doc-changes:${affectedPaths.length}`,
        `source-path:${path}`,
      ],
    };
    upsertRepairRecord(context.state, record);
    autoRepairTaskId = repairTask.id;
  }

  await context.saveState();

  if (autoRepairTaskId) {
    return `queued ${context.state.pendingDocChanges.length} doc changes and auto-enqueued drift repair ${autoRepairTaskId}`;
  }

  if (context.state.pendingDocChanges.length >= DOC_DRIFT_REPAIR_THRESHOLD) {
    if (driftRepairActive) {
      return `queued ${context.state.pendingDocChanges.length} doc changes (drift repair already active)`;
    }
    if (autoRepairCoolingDown) {
      return `queued ${context.state.pendingDocChanges.length} doc changes (auto repair cooling down)`;
    }
    return `queued ${context.state.pendingDocChanges.length} doc changes`;
  }
  return `noted change for ${path}`;
};

const docSyncHandler: TaskHandler = async (_, context) => {
  const changes = [...context.state.pendingDocChanges];
  context.state.pendingDocChanges = [];
  await context.saveState();
  return changes.length
    ? `synced ${changes.length} doc changes`
    : "no doc changes to sync";
};

const driftRepairHandler: TaskHandler = async (task, context) => {
  const startedAt = Date.now();
  const startedAtIso = new Date().toISOString();
  const requestedBy = String(task.payload.requestedBy ?? "scheduler");
  const repairId =
    typeof task.payload.__repairId === "string" &&
    task.payload.__repairId.trim().length > 0
      ? task.payload.__repairId.trim()
      : `manual-drift:${task.id}`;
  const extractedPaths = context.state.pendingDocChanges.splice(0);
  const extraPaths = Array.isArray(task.payload.paths)
    ? (task.payload.paths as string[])
    : [];
  const processedPaths = extractedPaths.length ? extractedPaths : extraPaths;

  if (processedPaths.length === 0) {
    return "no drift to repair";
  }

  const existingRepair = context.state.repairRecords.find(
    (record) => record.repairId === repairId,
  );

  if (!existingRepair) {
    upsertRepairRecord(context.state, {
      repairId,
      classification: "doc-drift",
      trigger:
        typeof task.payload.__repairId === "string"
          ? "pending-doc-threshold"
          : "manual-drift-repair",
      sourceTaskId: task.id,
      sourceTaskType: task.type,
      repairTaskType: "drift-repair",
      repairTaskId: task.id,
      repairRunId: task.idempotencyKey,
      verificationMode: "knowledge-pack",
      status: "running",
      detectedAt: startedAtIso,
      queuedAt: startedAtIso,
      startedAt: startedAtIso,
      affectedPaths: processedPaths,
      evidence: [`requestedBy:${requestedBy}`],
    });
  } else {
    updateRepairRecord(context.state, repairId, (record) => ({
      ...record,
      status: "running",
      startedAt: startedAtIso,
      repairTaskId: record.repairTaskId ?? task.id,
      repairRunId: task.idempotencyKey ?? record.repairRunId,
    }));
  }

  let targets = Array.isArray(task.payload.targets)
    ? (task.payload.targets as string[])
    : ["doc-specialist", "reddit-helper"];

  if (!Array.isArray(task.payload.targets)) {
    try {
      const registry = await getAgentRegistry();
      const discovered = registry.listAgents().map((agent) => agent.id);
      if (discovered.length > 0) {
        targets = discovered;
      }
    } catch {
      // Keep fallback defaults if registry is unavailable
    }
  }

  let docSpecResult: {
    packPath: string;
    packId: string;
    docsProcessed: number;
  } | null = null;
  try {
    docSpecResult = await runDocSpecialistJob(
      processedPaths,
      targets,
      requestedBy,
      context.logger,
    );
  } catch (error) {
    context.logger.warn(
      `[drift-repair] doc specialist failed: ${(error as Error).message}`,
    );
  }

  let verificationSummary = "doc-specialist did not produce a knowledge pack";
  let verificationEvidence: string[] = [];
  let verified = false;

  if (docSpecResult?.packPath) {
    try {
      const packStats = await stat(docSpecResult.packPath);
      verified =
        packStats.isFile() && Number(docSpecResult.docsProcessed ?? 0) > 0;
      verificationSummary = verified
        ? `knowledge pack verified (${docSpecResult.docsProcessed} docs at ${docSpecResult.packPath})`
        : `knowledge pack verification failed (${docSpecResult.docsProcessed ?? 0} docs at ${docSpecResult.packPath})`;
      verificationEvidence = [
        `pack:${docSpecResult.packPath}`,
        `docsProcessed:${docSpecResult.docsProcessed ?? 0}`,
      ];
    } catch (error) {
      verificationSummary = `knowledge pack verification failed: ${(error as Error).message}`;
    }
  }

  const record: DriftRepairRecord = {
    runId: randomUUID(),
    requestedBy,
    processedPaths,
    generatedPackIds: docSpecResult?.packId ? [docSpecResult.packId] : [],
    packPaths: docSpecResult?.packPath ? [docSpecResult.packPath] : undefined,
    docsProcessed: docSpecResult?.docsProcessed,
    updatedAgents: targets,
    durationMs: Date.now() - startedAt,
    completedAt: new Date().toISOString(),
    notes:
      [
        docSpecResult?.packPath ? `pack:${docSpecResult.packPath}` : null,
        task.payload.notes ? String(task.payload.notes) : null,
      ]
        .filter(Boolean)
        .join(" | ") || undefined,
  };

  context.state.driftRepairs.push(record);
  context.state.lastDriftRepairAt = record.completedAt;

  updateRepairRecord(context.state, repairId, (existing) => ({
    ...existing,
    status: verified ? "verified" : "failed",
    repairTaskId: task.id,
    repairRunId: task.idempotencyKey ?? existing.repairRunId,
    completedAt: record.completedAt,
    verifiedAt: verified ? record.completedAt : existing.verifiedAt,
    verificationSummary,
    evidence: [
      ...(existing.evidence ?? []),
      ...verificationEvidence,
    ].slice(-10),
    lastError: verified ? undefined : verificationSummary,
  }));

  await context.saveState();

  const packEvidence = docSpecResult?.packPath
    ? [
        {
          type: "log" as const,
          path: docSpecResult.packPath,
          summary: `knowledge pack ${docSpecResult.packId}`,
        },
      ]
    : [
        {
          type: "log" as const,
          path: context.config.stateFile,
          summary: "drift repair record saved to orchestrator state",
        },
      ];
  getMilestoneEmitter()?.emit({
    milestoneId: `drift.repair.${record.runId}`,
    timestampUtc: record.completedAt,
    scope: "pipeline",
    claim: `Doc drift repair completed: ${processedPaths.length} path(s) processed.`,
    evidence: packEvidence,
    riskStatus: docSpecResult ? "on-track" : "at-risk",
    nextAction: verified
      ? "Verify knowledge pack is consumed by reddit-helper."
      : "Investigate why doc-specialist did not produce a verified pack.",
    source: "orchestrator",
  });

  if (!verified) {
    throwTaskFailure("drift-repair", verificationSummary);
  }

  if (docSpecResult) {
    return `drift repair ${record.runId.slice(0, 8)} generated and verified ${docSpecResult.packId}`;
  }
  return `drift repair ${record.runId.slice(0, 8)} verified`;
};

const redditResponseHandler: TaskHandler = async (task, context) => {
  const now = new Date().toISOString();
  const demandFingerprintBefore = buildDemandStateFingerprint(context.state);
  const queueItem = resolveRedditResponseQueueItem(
    context.state.redditQueue,
    task.payload.queue,
    now,
  );

  if (!queueItem) {
    await context.saveState();
    return "no selected reddit queue items";
  }

  const responder = String(task.payload.responder ?? "reddit-helper");
  const matchingDraft = context.state.rssDrafts.find(
    (draft) => draft.draftId === (queueItem?.draftRecordId ?? queueItem.id),
  );
  const latestPack = await findLatestKnowledgePack(
    context.config.knowledgePackDir,
  );

  let agentResult: {
    replyText: string;
    confidence: number;
    ctaVariant?: string;
    devvitPayloadPath?: string;
    packId?: string;
    packPath?: string;
  } | null = null;

  try {
    agentResult = await runRedditHelperJob(
      {
        queue: queueItem,
        rssDraft: matchingDraft,
        knowledgePackPath: latestPack?.path,
        knowledgePack: latestPack?.pack,
      },
      context.logger,
    );
  } catch (error) {
    context.logger.warn(
      `[reddit-response] helper failed: ${(error as Error).message}`,
    );
    throwTaskFailure("reddit response", error);
  }

  const draftedResponse =
    agentResult?.replyText ?? queueItem.suggestedReply ?? queueItem.question;
  const confidence = agentResult?.confidence ?? 0.75;
  const status: "drafted" | "posted" = "drafted";

  const record: RedditReplyRecord = {
    queueId: queueItem.id,
    subreddit: queueItem.subreddit,
    question: queueItem.question,
    draftedResponse,
    responder,
    confidence,
    status,
    respondedAt: now,
    link: queueItem.link,
    notes: matchingDraft ? `rssDraft:${matchingDraft.draftId}` : undefined,
    rssDraftId: matchingDraft?.draftId,
    devvitPayloadPath: agentResult?.devvitPayloadPath,
    packId: agentResult?.packId ?? latestPack?.pack?.id ?? undefined,
    packPath: agentResult?.packPath ?? latestPack?.path,
  };

  context.state.redditResponses.push(record);
  context.state.lastRedditResponseAt = now;
  await context.saveState();

  emitMilestoneSafely({
    milestoneId: `reddit.response.${queueItem.id}`,
    timestampUtc: now,
    scope: "community",
    claim: `Reddit response drafted for ${queueItem.subreddit}.`,
    evidence: [
      {
        type: "log",
        path:
          agentResult?.devvitPayloadPath ??
          context.config.stateFile,
        summary: agentResult?.devvitPayloadPath
          ? "reddit-helper generated a Devvit-ready payload"
          : "response record saved to orchestrator state",
      },
    ],
    riskStatus: agentResult ? "on-track" : "at-risk",
    nextAction: queueDepthNextAction(context.state.redditQueue.length),
    source: "orchestrator",
  });

  await emitDemandSummaryIfChanged(demandFingerprintBefore, context);
  return `drafted reddit reply for ${queueItem.subreddit} (${queueItem.id})`;
};

const securityAuditHandler: TaskHandler = async (task, context) => {
  await assertToolGatePermission("security-audit");
  const payload = {
    id: randomUUID(),
    type: String(task.payload.type ?? "scan"),
    scope: String(task.payload.scope ?? "workspace"),
  };

  try {
    const result = await runSpawnedAgentJob(
      "security-agent",
      payload,
      "SECURITY_AGENT_RESULT_FILE",
      context.logger,
    );
    assertSpawnedAgentReportedSuccess(result, "security audit");
    const summary =
      (result.summary as Record<string, unknown> | undefined) ?? {};
    const critical = Number(summary.critical ?? 0);
    const total = Number(summary.total ?? 0);
    return `security audit complete (${critical} critical, ${total} findings)`;
  } catch (error) {
    throwTaskFailure("security audit", error);
  }
};

const summarizeContentHandler: TaskHandler = async (task, context) => {
  await assertToolGatePermission("summarize-content");
  const sourceType = String(task.payload.sourceType ?? "document") as
    | "document"
    | "transcript"
    | "report";
  const payload = {
    id: randomUUID(),
    source: {
      type: sourceType,
      content: String(task.payload.content ?? ""),
      metadata:
        typeof task.payload.metadata === "object" &&
        task.payload.metadata !== null
          ? (task.payload.metadata as Record<string, unknown>)
          : undefined,
    },
    constraints:
      typeof task.payload.constraints === "object" &&
      task.payload.constraints !== null
        ? (task.payload.constraints as Record<string, unknown>)
        : undefined,
    format: task.payload.format
      ? String(task.payload.format)
      : "executive_summary",
  };

  try {
    const result = await runSpawnedAgentJob(
      "summarization-agent",
      payload,
      "SUMMARIZATION_AGENT_RESULT_FILE",
      context.logger,
    );
    assertSpawnedAgentReportedSuccess(result, "summarization");
    const confidence = Number(result.confidence ?? 0);
    const format = String(result.format ?? payload.format);
    return `summarization complete (${format}, confidence ${confidence.toFixed(2)})`;
  } catch (error) {
    throwTaskFailure("summarization", error);
  }
};

const systemMonitorHandler: TaskHandler = async (task, context) => {
  await assertToolGatePermission("system-monitor");
  const payload = {
    id: randomUUID(),
    type: String(task.payload.type ?? "health"),
    agents: Array.isArray(task.payload.agents)
      ? (task.payload.agents as string[])
      : undefined,
  };

  try {
    const result = await runSpawnedAgentJob(
      "system-monitor-agent",
      payload,
      "SYSTEM_MONITOR_AGENT_RESULT_FILE",
      context.logger,
    );
    assertSpawnedAgentReportedSuccess(result, "system monitor");
    const metrics =
      (result.metrics as Record<string, unknown> | undefined) ?? {};
    const alerts = Array.isArray(metrics.alerts) ? metrics.alerts.length : 0;
    return `system monitor complete (${alerts} alerts)`;
  } catch (error) {
    throwTaskFailure("system monitor", error);
  }
};

const buildRefactorHandler: TaskHandler = async (task, context) => {
  await assertToolGatePermission("build-refactor");
  const payload = {
    id: randomUUID(),
    type: String(task.payload.type ?? "refactor"),
    scope: String(task.payload.scope ?? "src"),
    constraints:
      typeof task.payload.constraints === "object" &&
      task.payload.constraints !== null
        ? (task.payload.constraints as Record<string, unknown>)
        : undefined,
  };

  try {
    const result = await runSpawnedAgentJob(
      "build-refactor-agent",
      payload,
      "BUILD_REFACTOR_AGENT_RESULT_FILE",
      context.logger,
    );

    const summary =
      (result.summary as Record<string, unknown> | undefined) ?? {};
    const filesChanged = Number(summary.filesChanged ?? 0);
    const confidence = Number(summary.confidence ?? 0);
    return `build-refactor complete (${filesChanged} files, confidence ${confidence.toFixed(2)})`;
  } catch (error) {
    throwTaskFailure("build-refactor", error);
  }
};

const contentGenerateHandler: TaskHandler = async (task, context) => {
  await assertToolGatePermission("content-generate");
  const payload = {
    id: randomUUID(),
    type: String(task.payload.type ?? "readme"),
    source:
      typeof task.payload.source === "object" && task.payload.source !== null
        ? (task.payload.source as Record<string, unknown>)
        : { name: "Project", description: "Generated content" },
    style: task.payload.style ? String(task.payload.style) : undefined,
    length: task.payload.length ? String(task.payload.length) : undefined,
  };

  try {
    const result = await runSpawnedAgentJob(
      "content-agent",
      payload,
      "CONTENT_AGENT_RESULT_FILE",
      context.logger,
    );

    const metrics =
      (result.metrics as Record<string, unknown> | undefined) ?? {};
    const wordCount = Number(metrics.wordCount ?? 0);
    const generatedType = String(metrics.generatedType ?? payload.type);
    return `content generation complete (${generatedType}, ${wordCount} words)`;
  } catch (error) {
    throwTaskFailure("content generation", error);
  }
};

const integrationWorkflowHandler: TaskHandler = async (task, context) => {
  await assertToolGatePermission("integration-workflow");
  const payload = {
    id: randomUUID(),
    type: String(task.payload.type ?? "workflow"),
    steps: Array.isArray(task.payload.steps)
      ? (task.payload.steps as Record<string, unknown>[])
      : [],
  };

  try {
    const result = await runSpawnedAgentJob(
      "integration-agent",
      payload,
      "INTEGRATION_AGENT_RESULT_FILE",
      context.logger,
    );

    const steps = Array.isArray(result.steps) ? result.steps.length : 0;
    if (result.success !== true) {
      const reason =
        typeof result.error === "string"
          ? result.error
          : "agent returned unsuccessful result";
      throw new Error(`integration workflow failed: ${reason}`);
    }
    return `integration workflow complete (${steps} steps)`;
  } catch (error) {
    throwTaskFailure("integration workflow", error);
  }
};

const normalizeDataHandler: TaskHandler = async (task, context) => {
  await assertToolGatePermission("normalize-data");
  const payload = {
    id: randomUUID(),
    type: String(task.payload.type ?? "normalize"),
    input: task.payload.input !== undefined ? task.payload.input : [],
    schema:
      typeof task.payload.schema === "object" && task.payload.schema !== null
        ? (task.payload.schema as Record<string, unknown>)
        : {},
  };

  try {
    const result = await runSpawnedAgentJob(
      "normalization-agent",
      payload,
      "NORMALIZATION_AGENT_RESULT_FILE",
      context.logger,
    );

    const metrics =
      (result.metrics as Record<string, unknown> | undefined) ?? {};
    const inputRecords = Number(metrics.inputRecords ?? 0);
    const outputRecords = Number(metrics.outputRecords ?? 0);
    return `normalize-data complete (${outputRecords}/${inputRecords} records normalized)`;
  } catch (error) {
    throwTaskFailure("normalize-data", error);
  }
};

const marketResearchHandler: TaskHandler = async (task, context) => {
  await assertToolGatePermission("market-research");
  const payload = {
    id: randomUUID(),
    query: String(task.payload.query ?? "market research"),
    scope: String(task.payload.scope ?? "general"),
    constraints:
      typeof task.payload.constraints === "object" &&
      task.payload.constraints !== null
        ? (task.payload.constraints as Record<string, unknown>)
        : undefined,
  };

  try {
    const result = await runSpawnedAgentJob(
      "market-research-agent",
      payload,
      "MARKET_RESEARCH_AGENT_RESULT_FILE",
      context.logger,
    );

    const findings = Array.isArray(result.findings)
      ? result.findings.length
      : 0;
    const confidence = Number(result.confidence ?? 0);
    return `market research complete (${findings} findings, confidence ${confidence.toFixed(2)})`;
  } catch (error) {
    throwTaskFailure("market research", error);
  }
};

const dataExtractionHandler: TaskHandler = async (task, context) => {
  await assertToolGatePermission("data-extraction");
  const payload = {
    id: randomUUID(),
    source:
      typeof task.payload.source === "object" && task.payload.source !== null
        ? (task.payload.source as Record<string, unknown>)
        : { type: "inline", content: String(task.payload.content ?? "") },
    schema:
      typeof task.payload.schema === "object" && task.payload.schema !== null
        ? (task.payload.schema as Record<string, unknown>)
        : undefined,
  };

  try {
    const result = await runSpawnedAgentJob(
      "data-extraction-agent",
      payload,
      "DATA_EXTRACTION_AGENT_RESULT_FILE",
      context.logger,
    );

    const recordsExtracted = Number(result.recordsExtracted ?? 0);
    const entitiesFound = Number(result.entitiesFound ?? 0);
    return `data extraction complete (${recordsExtracted} records, ${entitiesFound} entities)`;
  } catch (error) {
    throwTaskFailure("data extraction", error);
  }
};

const qaVerificationHandler: TaskHandler = async (task, context) => {
  await assertToolGatePermission("qa-verification");
  const payload = {
    id: randomUUID(),
    target: String(task.payload.target ?? "workspace"),
    suite: String(task.payload.suite ?? "smoke"),
    mode:
      task.payload.mode !== undefined ? String(task.payload.mode) : undefined,
    testCommand:
      typeof task.payload.testCommand === "string"
        ? task.payload.testCommand
        : undefined,
    dryRun:
      task.payload.dryRun === true ||
      (typeof task.payload.constraints === "object" &&
        task.payload.constraints !== null &&
        (task.payload.constraints as Record<string, unknown>).dryRun === true),
    constraints:
      typeof task.payload.constraints === "object" &&
      task.payload.constraints !== null
        ? (task.payload.constraints as Record<string, unknown>)
        : undefined,
  };

  try {
    const result = await runSpawnedAgentJob(
      "qa-verification-agent",
      payload,
      "QA_VERIFICATION_AGENT_RESULT_FILE",
      context.logger,
    );
    const gate = await getToolGate();
    await gate.preflightSkillAccess("qa-verification-agent", "testRunner", {
      mode: "execute",
      taskType: "qa-verification",
      executedCommand:
        typeof result.executedCommand === "string"
          ? result.executedCommand
          : undefined,
      outcomeKind:
        typeof result.outcomeKind === "string" ? result.outcomeKind : undefined,
    });

    if (result.dryRun === true) {
      return `qa verification dry-run complete (${String(result.outcomeSummary ?? "no tests executed")})`;
    }

    const totalChecks = Number(result.totalChecks ?? result.testsRun ?? 0);
    const passedChecks = Number(result.passedChecks ?? result.testsPassed ?? 0);
    if (totalChecks <= 0) {
      throw new Error(
        "qa verification returned success without any executed checks; use dry-run mode for no-op validation",
      );
    }

    const outcomeKind =
      typeof result.outcomeKind === "string" ? result.outcomeKind : "checks";
    const unitLabel = outcomeKind === "tests" ? "tests" : "checks";
    const commandNote =
      typeof result.executedCommand === "string" &&
      result.executedCommand.length > 0
        ? ` via ${result.executedCommand}`
        : "";
    return `qa verification complete (${passedChecks}/${totalChecks} ${unitLabel} passed${commandNote})`;
  } catch (error) {
    throwTaskFailure("qa verification", error);
  }
};

const skillAuditHandler: TaskHandler = async (task, context) => {
  await assertToolGatePermission("skill-audit");
  const payload = {
    id: randomUUID(),
    skillIds: Array.isArray(task.payload.skillIds)
      ? (task.payload.skillIds as string[])
      : undefined,
    depth: String(task.payload.depth ?? "standard"),
    checks: Array.isArray(task.payload.checks)
      ? (task.payload.checks as string[])
      : undefined,
  };

  try {
    const result = await runSpawnedAgentJob(
      "skill-audit-agent",
      payload,
      "SKILL_AUDIT_AGENT_RESULT_FILE",
      context.logger,
    );

    const audited = Number(result.skillsAudited ?? 0);
    const issues = Number(result.issuesFound ?? 0);
    return `skill audit complete (${audited} skills, ${issues} issues)`;
  } catch (error) {
    throwTaskFailure("skill audit", error);
  }
};

const rssSweepHandler: TaskHandler = async (task, context) => {
  const demandFingerprintBefore = buildDemandStateFingerprint(context.state);
  const configPath =
    typeof task.payload.configPath === "string"
      ? task.payload.configPath
      : (context.config.rssConfigPath ??
        join(process.cwd(), "..", "rss_filter_config.json"));
  const draftsPath =
    typeof task.payload.draftsPath === "string"
      ? task.payload.draftsPath
      : (context.config.redditDraftsPath ??
        join(process.cwd(), "..", "logs", "reddit-drafts.jsonl"));

  const rawConfig = await readFile(configPath, "utf-8");
  const rssConfig = JSON.parse(rawConfig);
  const now = new Date().toISOString();
  let drafted = 0;

  const pillars = Object.entries(rssConfig.pillars ?? {}) as Array<
    [string, any]
  >;
  for (const [pillarKey, pillar] of pillars) {
    const feeds = pillar.feeds ?? [];
    for (const feed of feeds) {
      const response = await fetch(feed.url, {
        headers: { "User-Agent": "openclaw-orchestrator" },
      });
      if (!response.ok) {
        context.logger.warn(`[rss] failed ${feed.url}: ${response.status}`);
        continue;
      }
      const xml = await response.text();
      const entries = parseRssEntries(xml);
      for (const entry of entries) {
        const seenId = `${feed.id}:${entry.id}`;
        if (context.state.rssSeenIds.includes(seenId)) continue;

        const textBlob = `${entry.title}\n${entry.content}\n${entry.author ?? ""}\n${feed.subreddit}\n${entry.link}`;
        const clusterScore = buildScore(
          textBlob,
          pillar.keyword_clusters ?? {},
        );

        const crossTriggers =
          rssConfig.cross_pillar?.high_intent_triggers ?? [];
        const crossMatches = crossTriggers.filter((trigger: string) =>
          textBlob.toLowerCase().includes(trigger.toLowerCase()),
        );

        const scoreBreakdown: Record<string, number> = {};
        let totalScore = 0;

        Object.entries(clusterScore.breakdown).forEach(([cluster, count]) => {
          let weight = 1;
          if (["emotional_identity_pain"].includes(cluster))
            weight = rssConfig.scoring.weights.emotional_pain_match;
          if (
            [
              "core_instability",
              "debug_blindness",
              "preview_vs_production",
              "export_quality_shock",
              "autonomy_collapse",
              "migration_and_rebrand_brittleness",
            ].includes(cluster)
          ) {
            weight = rssConfig.scoring.weights.execution_failure_match;
          }
          if (["security_exposure", "skills_supply_chain"].includes(cluster))
            weight = rssConfig.scoring.weights.security_exposure_match;
          if (["payments_and_backend"].includes(cluster))
            weight = rssConfig.scoring.weights.payments_backend_match;
          if (["hardening_and_runtime"].includes(cluster))
            weight = rssConfig.scoring.weights.infra_hardening_match;

          const weighted = count * weight;
          scoreBreakdown[cluster] = weighted;
          totalScore += weighted;
        });

        if (crossMatches.length > 0) {
          const bonus =
            rssConfig.scoring.weights.cross_pillar_trigger_match *
            crossMatches.length;
          scoreBreakdown.cross_pillar_trigger_match = bonus;
          totalScore += bonus;
        }

        const thresholds = rssConfig.scoring.thresholds;
        if (totalScore < thresholds.draft_if_score_gte) {
          rememberRssId(context, seenId);
          continue;
        }

        let tag: "draft" | "priority" | "manual-review" = "draft";
        if (totalScore >= thresholds.manual_review_if_score_gte)
          tag = "manual-review";
        else if (totalScore >= thresholds.priority_draft_if_score_gte)
          tag = "priority";

        const ctas = rssConfig.drafting?.cta_variants?.[pillarKey] ?? [];
        const ctaVariant =
          ctas[0] ??
          "If you want, share more context and I’ll suggest the next move.";

        const suggestedReply = `Saw your post about ${entry.title}. ${ctaVariant}`;

        const record: RssDraftRecord = {
          draftId: randomUUID(),
          pillar: pillarKey,
          feedId: feed.id,
          subreddit: feed.subreddit,
          title: entry.title,
          content: entry.content,
          link: entry.link,
          author: entry.author,
          matchedKeywords: [...clusterScore.matched, ...crossMatches],
          scoreBreakdown,
          totalScore,
          suggestedReply,
          ctaVariant,
          tag,
          queuedAt: now,
        };

        context.state.rssDrafts.push(record);
        context.state.redditQueue.push({
          id: record.draftId,
          subreddit: feed.subreddit,
          question: entry.title,
          link: entry.link,
          queuedAt: now,
          tag,
          pillar: pillarKey,
          feedId: feed.id,
          entryContent: entry.content,
          author: entry.author,
          ctaVariant,
          matchedKeywords: record.matchedKeywords,
          score: totalScore,
          draftRecordId: record.draftId,
          suggestedReply,
        });
        ensureRedditQueueLimit(context);
        await appendDraft(draftsPath, record);
        rememberRssId(context, seenId);
        drafted += 1;
      }
    }
  }

  context.state.lastRssSweepAt = now;
  await context.saveState();

  if (drafted > 0) {
    const manualReviewCount = context.state.rssDrafts.filter(
      (item) => item.tag === "manual-review" && item.queuedAt === now,
    ).length;
    const priorityCount = context.state.rssDrafts.filter(
      (item) => item.tag === "priority" && item.queuedAt === now,
    ).length;

    emitMilestoneSafely({
      milestoneId: `rss.sweep.${now}`,
      timestampUtc: now,
      scope: "demand",
      claim: `RSS sweep surfaced ${drafted} new lead${drafted === 1 ? "" : "s"} for follow-up.`,
      evidence: [
        {
          type: "log",
          path: draftsPath,
          summary: `${drafted} draft record${drafted === 1 ? "" : "s"} appended during sweep`,
        },
        {
          type: "log",
          path: configPath,
          summary: "scoring rules loaded from rss_filter_config.json",
        },
      ],
      riskStatus: manualReviewCount > 0 ? "at-risk" : "on-track",
      nextAction:
        manualReviewCount > 0
          ? `Review ${manualReviewCount} manual-review lead${manualReviewCount === 1 ? "" : "s"} before posting.`
          : priorityCount > 0
            ? `Route ${priorityCount} priority lead${priorityCount === 1 ? "" : "s"} into reddit-response.`
            : queueDepthNextAction(context.state.redditQueue.length),
      source: "orchestrator",
    });
  }

  await emitDemandSummaryIfChanged(demandFingerprintBefore, context);
  return drafted > 0
    ? `rss sweep drafted ${drafted} replies`
    : "rss sweep complete (no drafts)";
};

const heartbeatHandler: TaskHandler = async (task) => {
  return `heartbeat (${task.payload.reason ?? "interval"})`;
};

const agentDeployHandler: TaskHandler = async (task, context) => {
  const deploymentId = randomUUID();
  const agentName = String(
    task.payload.agentName ?? `agent-${deploymentId.slice(0, 6)}`,
  );
  const template = String(task.payload.template ?? "doc-specialist");
  const templatePath = String(
    task.payload.templatePath ?? join(process.cwd(), "..", "agents", template),
  );
  const deployBase =
    context.config.deployBaseDir ??
    join(process.cwd(), "..", "agents-deployed");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const repoPath = String(
    task.payload.repoPath ?? join(deployBase, `${agentName}-${timestamp}`),
  );
  const config =
    typeof task.payload.config === "object" && task.payload.config !== null
      ? (task.payload.config as Record<string, unknown>)
      : {};

  await mkdir(deployBase, { recursive: true });
  await cp(templatePath, repoPath, { recursive: true });

  const deploymentNotes = {
    deploymentId,
    agentName,
    template,
    templatePath: basename(templatePath),
    deployedAt: new Date().toISOString(),
    runHint: "npm install && npm run dev -- <payload.json>",
    payload: task.payload,
  };
  await writeFile(
    join(repoPath, "DEPLOYMENT.json"),
    JSON.stringify(deploymentNotes, null, 2),
    "utf-8",
  );

  const record: AgentDeploymentRecord = {
    deploymentId,
    agentName,
    template,
    repoPath,
    config,
    status: "deployed",
    deployedAt: new Date().toISOString(),
    notes: task.payload.notes ? String(task.payload.notes) : undefined,
  };

  context.state.agentDeployments.push(record);
  context.state.lastAgentDeployAt = record.deployedAt;
  await context.saveState();

  emitMilestoneSafely({
    milestoneId: `agent.deploy.${deploymentId}`,
    timestampUtc: record.deployedAt,
    scope: "runtime",
    claim: `Agent "${agentName}" deployed from template "${template}".`,
    evidence: [
      {
        type: "log" as const,
        path: join(repoPath, "DEPLOYMENT.json"),
        summary: `deployment manifest for ${agentName}`,
      },
    ],
    riskStatus: "on-track",
    nextAction: `Run "npm install && npm run dev" in ${repoPath} to start the agent.`,
    source: "orchestrator",
  });

  return `deployed ${agentName} via ${template} template to ${repoPath}`;
};

const nightlyBatchHandler: TaskHandler = async (task, context) => {
  const { state, config, logger } = context;
  const now = new Date().toISOString();
  const demandFingerprintBefore = buildDemandStateFingerprint(state);
  const digestDir =
    config.digestDir ?? join(process.cwd(), "..", "logs", "digests");
  await mkdir(digestDir, { recursive: true });

  // Nightly batch orchestrates: doc-sync and derives selection from RSS routing tags.
  let docsSynced = 0;
  let itemsMarked = 0;
  let manualReviewApprovalsRequested = 0;
  let draftApprovalsRequested = 0;

  if (state.pendingDocChanges.length > 0) {
    docsSynced = state.pendingDocChanges.length;
    state.pendingDocChanges = [];
  }

  // Only priority-tagged items are auto-selected for reddit-helper drafting.
  for (let i = 0; i < state.redditQueue.length; i++) {
    const item = state.redditQueue[i];
    const selectedForDraft = shouldSelectQueueItemForDraft(item);
    item.selectedForDraft = selectedForDraft;
    if (selectedForDraft) {
      itemsMarked += 1;
    }
    if (
      item.tag === "manual-review" &&
      ensureManualReviewApprovalRecord(state.approvals, item, now)
    ) {
      manualReviewApprovalsRequested += 1;
      onApprovalRequested(
        buildManualReviewApprovalTaskId(item.id),
        "reddit-response",
      );
    }
  }

  const draftApprovalCandidates = state.redditQueue
    .filter((item) => item.tag === "draft")
    .sort((left, right) => {
      const scoreDelta = (right.score ?? 0) - (left.score ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return left.queuedAt.localeCompare(right.queuedAt);
    })
    .slice(0, REDDIT_DRAFT_APPROVALS_PER_BATCH);

  for (const item of draftApprovalCandidates) {
    if (ensureDraftReviewApprovalRecord(state.approvals, item, now)) {
      draftApprovalsRequested += 1;
      onApprovalRequested(buildDraftReviewApprovalTaskId(item.id), "reddit-response");
    }
  }

  // Compile digest
  const digest = {
    generatedAt: now,
    batchId: randomUUID(),
    summary: {
      docsProcessed: docsSynced,
      queueTotal: state.redditQueue.length,
      markedForDraft: itemsMarked,
      manualReviewApprovalsRequested,
      draftApprovalsRequested,
    },
    redditQueue: state.redditQueue.filter((q) => q.selectedForDraft),
  };

  const dateTag = new Date(now).toISOString().split("T")[0];
  const digestPath = join(digestDir, `digest-${dateTag}.json`);
  await writeFile(digestPath, JSON.stringify(digest, null, 2), "utf-8");

  state.lastNightlyBatchAt = now;
  await context.saveState();
  await emitDemandSummaryIfChanged(demandFingerprintBefore, context);

  emitMilestoneSafely({
    milestoneId: `nightly.batch.${digest.batchId}`,
    timestampUtc: now,
    scope: "runtime",
    claim:
      manualReviewApprovalsRequested > 0
        ? `Nightly batch completed: ${docsSynced} doc(s) synced, ${itemsMarked} priority item(s) selected for draft, ${manualReviewApprovalsRequested} manual-review approval(s) requested, ${draftApprovalsRequested} draft promotion approval(s) requested.`
        : draftApprovalsRequested > 0
          ? `Nightly batch completed: ${docsSynced} doc(s) synced, ${itemsMarked} priority item(s) selected for draft, ${draftApprovalsRequested} draft promotion approval(s) requested.`
          : `Nightly batch completed: ${docsSynced} doc(s) synced, ${itemsMarked} priority item(s) selected for draft.`,
    evidence: [
      {
        type: "log" as const,
        path: digestPath,
        summary: `batch digest ${digest.batchId}`,
      },
    ],
    riskStatus: "on-track",
    nextAction:
      manualReviewApprovalsRequested > 0
        ? `Review ${manualReviewApprovalsRequested} manual-review approval${manualReviewApprovalsRequested === 1 ? "" : "s"} before replaying reddit-response.`
        : draftApprovalsRequested > 0
          ? `Review ${draftApprovalsRequested} draft promotion approval${draftApprovalsRequested === 1 ? "" : "s"} before replaying reddit-response.`
          : queueDepthNextAction(state.redditQueue.length),
    source: "orchestrator",
  });

  return manualReviewApprovalsRequested > 0
    ? `nightly batch: synced ${docsSynced} docs, selected ${itemsMarked} priority items for draft, requested ${manualReviewApprovalsRequested} manual-review approvals, requested ${draftApprovalsRequested} draft promotion approvals`
    : draftApprovalsRequested > 0
      ? `nightly batch: synced ${docsSynced} docs, selected ${itemsMarked} priority items for draft, requested ${draftApprovalsRequested} draft promotion approvals`
      : `nightly batch: synced ${docsSynced} docs, selected ${itemsMarked} priority items for draft`;
};

const sendDigestHandler: TaskHandler = async (task, context) => {
  const { config, logger } = context;
  const digestDir =
    config.digestDir ?? join(process.cwd(), "..", "logs", "digests");

  try {
    const files = await readdir(digestDir);
    const digests = files
      .filter((f) => f.startsWith("digest-") && f.endsWith(".json"))
      .sort()
      .reverse();

    if (!digests.length) return "no digests to send";

    const latestPath = join(digestDir, digests[0]);
    const raw = await readFile(latestPath, "utf-8");
    const digest = JSON.parse(raw) as any;

    const summary = digest.summary;
    const itemCount = summary.markedForDraft ?? 0;

    // Build and send notification
    const notifierConfig = buildNotifierConfig(config);
    if (notifierConfig) {
      await sendNotification(
        notifierConfig,
        {
          title: `🚀 ${itemCount} Reddit Leads Ready for Review`,
          summary: `Your nightly RSS sweep collected ${summary.queueTotal} leads.\n${itemCount} priority-tagged items are ready for drafting.`,
          count: itemCount,
          digest: summary,
          url: `${process.env.APP_URL || "http://localhost:3000"}/digests/${digests[0]}`,
        },
        logger,
      );
    } else {
      logger.log(
        `[send-digest] ${itemCount} leads ready (no notification channel configured; use log fallback)`,
      );
    }

    context.state.lastDigestNotificationAt = new Date().toISOString();
    await context.saveState();

    return `digest notification sent (${itemCount} leads)`;
  } catch (error) {
    throwTaskFailure("send-digest", error);
  }
};

const unknownTaskHandler: TaskHandler = async (task, context) => {
  const allowed = ALLOWED_TASK_TYPES.join(", ");
  throw new Error(`Invalid task type: ${task.type}. Allowed: ${allowed}`);
};

export const taskHandlers: Record<string, TaskHandler> = {
  startup: startupHandler,
  "doc-change": docChangeHandler,
  "doc-sync": docSyncHandler,
  "drift-repair": driftRepairHandler,
  "reddit-response": redditResponseHandler,
  "security-audit": securityAuditHandler,
  "summarize-content": summarizeContentHandler,
  "system-monitor": systemMonitorHandler,
  "build-refactor": buildRefactorHandler,
  "content-generate": contentGenerateHandler,
  "integration-workflow": integrationWorkflowHandler,
  "normalize-data": normalizeDataHandler,
  "market-research": marketResearchHandler,
  "data-extraction": dataExtractionHandler,
  "qa-verification": qaVerificationHandler,
  "skill-audit": skillAuditHandler,
  "rss-sweep": rssSweepHandler,
  "nightly-batch": nightlyBatchHandler,
  "send-digest": sendDigestHandler,
  heartbeat: heartbeatHandler,
  "agent-deploy": agentDeployHandler,
};

export function resolveTaskHandler(task: Task): TaskHandler {
  // Strict task type validation
  if (!validateTaskType(task.type)) {
    return unknownTaskHandler;
  }
  return taskHandlers[task.type] ?? unknownTaskHandler;
}
