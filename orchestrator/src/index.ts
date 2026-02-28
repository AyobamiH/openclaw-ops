import { loadConfig } from "./config.js";
import { DocIndexer } from "./docIndexer.js";
import { TaskQueue } from "./taskQueue.js";
import { loadState, saveStateWithOptions as persistState } from "./state.js";
import { resolveTaskHandler } from "./taskHandlers.js";
import { AlertManager, TaskFailureTracker, buildAlertConfig } from "./alerter.js";
import { OrchestratorState, Task } from "./types.js";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import cron from "node-cron";
import { startMetricsServer } from "./metrics/index.js";
import { onApprovalCompleted, onApprovalRequested } from "./metrics/index.js";
import { alertHandler } from "./alerts/alert-handler.js";
// memoryScheduler: loaded dynamically at runtime (private module, gitignored).
// Falls back to a no-op so the public build compiles and CI passes.
let memoryScheduler: { start(): void; stop(): Promise<void> | void } = {
  start: () => console.log('[orchestrator] Memory scheduler not available in this build'),
  stop:  () => {},
};
import { knowledgeIntegration } from "./knowledge/integration.js";
import { PersistenceIntegration } from "./persistence/index.js";
import { getAgentRegistry } from "./agentRegistry.js";
import { assertApprovalIfRequired, decideApproval, listPendingApprovals } from "./approvalGate.js";
import { buildOpenApiSpec } from "./openapi.js";
import express from "express";
import { requireBearerToken, verifyWebhookSignature, logSecurityEvent, verifyKeyRotationPolicy } from "./middleware/auth.js";
import { createValidationMiddleware, validateContentLength, AlertManagerWebhookSchema, ApprovalDecisionSchema, KBQuerySchema, PersistenceHistoricalSchema, TaskTriggerSchema } from "./middleware/validation.js";
import { webhookLimiter, apiLimiter, exportLimiter, healthLimiter, authLimiter } from "./middleware/rate-limit.js";
import { initMilestoneEmitter } from "./milestones/emitter.js";

/**
 * Security Posture Verification
 * Ensures critical security requirements are met before startup
 */
function verifySecurityPosture() {
  const requiredEnvVars = [
    'API_KEY',
    'WEBHOOK_SECRET',
    'MONGO_PASSWORD',
    'REDIS_PASSWORD',
    'MONGO_USERNAME',
  ];

  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[SECURITY] Critical environment variables missing: ${missing.join(', ')}. Refusing to start.`
    );
  }

  // Verify key rotation policy
  const keyStatus = verifyKeyRotationPolicy();
  if (!keyStatus.valid) {
    throw new Error(`[SECURITY] API Key rotation policy violation: ${keyStatus.warnings.join('; ')}`);
  }

  keyStatus.warnings.forEach(w => {
    console.warn(`[SECURITY] ⚠️ ${w}`);
  });

  console.log('[SECURITY] ✅ Posture verification: PASS (all required credentials configured)');
  console.log('[SECURITY] ✅ Key rotation policy: PASS');
}

type AgentMemoryState = {
  memoryVersion?: number;
  agentId?: string;
  orchestratorStatePath?: string | null;
  lastRunAt?: string | null;
  lastStatus?: string | null;
  lastTaskId?: string | null;
  lastTaskType?: string | null;
  lastError?: string | null;
  successCount?: number;
  errorCount?: number;
  totalRuns?: number;
  initializedAt?: string;
  taskTimeline?: Array<{
    taskId?: string | null;
    taskType?: string | null;
    status?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
    durationMs?: number | null;
    error?: string | null;
    resultSummary?: {
      success?: boolean;
      keys?: string[];
    };
  }>;
};

function parseBoundedInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  return Math.max(min, Math.min(max, floored));
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function redactMemoryState(state: AgentMemoryState, includeSensitive: boolean): AgentMemoryState {
  if (includeSensitive) return state;
  return {
    ...state,
    lastError: state.lastError ? "[redacted]" : null,
    taskTimeline: (state.taskTimeline ?? []).map((entry) => ({
      ...entry,
      error: entry.error ? "[redacted]" : null,
      resultSummary: entry.resultSummary
        ? {
            success: entry.resultSummary.success,
          }
        : undefined,
    })),
  };
}

async function loadAgentMemoryState(agentId: string): Promise<AgentMemoryState | null> {
  const agentConfigPath = join(process.cwd(), "..", "agents", agentId, "agent.config.json");
  try {
    const configRaw = await readFile(agentConfigPath, "utf-8");
    const config = JSON.parse(configRaw) as { serviceStatePath?: string };
    if (!config.serviceStatePath) return null;

    const serviceStatePath = resolve(dirname(agentConfigPath), config.serviceStatePath);
    const stateRaw = await readFile(serviceStatePath, "utf-8");
    return JSON.parse(stateRaw) as AgentMemoryState;
  } catch {
    return null;
  }
}

async function buildMemoryOverviewSummary(staleAfterHours: number = 24) {
  const registry = await getAgentRegistry();
  const agentIds = registry.listAgents().map((agent) => agent.id);
  const staleCutoff = Date.now() - staleAfterHours * 60 * 60 * 1000;

  let missingCount = 0;
  let staleCount = 0;
  let errorStateCount = 0;
  let totalRuns = 0;

  const samples: Array<{ agentId: string; reason: string; lastRunAt?: string | null }> = [];

  for (const agentId of agentIds) {
    const memory = await loadAgentMemoryState(agentId);
    if (!memory) {
      missingCount += 1;
      if (samples.length < 10) samples.push({ agentId, reason: "missing" });
      continue;
    }

    totalRuns += Number(memory.totalRuns ?? 0);

    const lastRunAt = memory.lastRunAt ?? null;
    const lastStatus = memory.lastStatus ?? null;

    if (!lastRunAt) {
      staleCount += 1;
      if (samples.length < 10) samples.push({ agentId, reason: "never-run", lastRunAt });
    } else {
      const ts = new Date(lastRunAt).getTime();
      if (!Number.isFinite(ts) || ts < staleCutoff) {
        staleCount += 1;
        if (samples.length < 10) samples.push({ agentId, reason: "stale", lastRunAt });
      }
    }

    if (lastStatus === "error") {
      errorStateCount += 1;
      if (samples.length < 10) samples.push({ agentId, reason: "error", lastRunAt });
    }
  }

  return {
    staleAfterHours,
    totalAgents: agentIds.length,
    agentsWithMemoryFile: agentIds.length - missingCount,
    agentsMissingMemoryFile: missingCount,
    staleAgents: staleCount,
    agentsLastStatusError: errorStateCount,
    totalRuns,
    sample: samples,
  };
}

async function bootstrap() {
  // Verify security posture FIRST
  verifySecurityPosture();
  const fastStartMode = process.env.ORCHESTRATOR_FAST_START === 'true';

  // Attempt to load the private memory scheduler (gitignored). No-op fallback if absent.
  try {
    // @ts-ignore — module is gitignored (private); only present on production server
    const mod = await import('./memory/scheduler.js');
    memoryScheduler = mod.memoryScheduler;
  } catch { /* private module not present — no-op fallback remains active */ }

  const config = await loadConfig();
  await mkdir(config.logsDir, { recursive: true });
  await mkdir(dirname(config.stateFile), { recursive: true });

  console.log("[orchestrator] config loaded", config);
  if (fastStartMode) {
    console.warn('[orchestrator] ⚠️ Fast-start mode enabled: skipping heavy boot stages');
  }

  try {
    const registry = await getAgentRegistry();
    const discoveredAgents = registry.listAgents().map((agent) => agent.id);
    console.log(`[orchestrator] agent registry initialized (${discoveredAgents.length} agents)`);
    if (discoveredAgents.length > 0) {
      console.log(`[orchestrator] agents: ${discoveredAgents.join(", ")}`);
    }
  } catch (error) {
    console.warn("[orchestrator] agent registry initialization failed:", error);
  }

  // Initialize alerting
  const alertConfig = buildAlertConfig();
  const alertManager = new AlertManager(alertConfig, console);
  const failureTracker = new TaskFailureTracker(alertManager, 3);

  console.log(`[orchestrator] alerts enabled: ${alertConfig.enabled}`);
  if (alertConfig.slackWebhook) console.log("[orchestrator] Slack alerting configured");

  // Initialize Prometheus metrics server
  try {
    await startMetricsServer();
  } catch (error) {
    console.error("[orchestrator] failed to start metrics server:", error);
    // Don't fail bootstrap if metrics server fails
  }

  // ============================================================
  // Phase 6: Metrics Persistence Layer (MongoDB)
  // ============================================================
  
  if (!fastStartMode) {
    try {
      await PersistenceIntegration.initialize();
    } catch (error) {
      console.error("[orchestrator] failed to initialize persistence layer:", error);
      const strictPersistence = config.strictPersistence === true || process.env.STRICT_PERSISTENCE === 'true';
      if (strictPersistence) {
        throw new Error("strict persistence enabled and persistence layer failed to initialize");
      }
      console.error('[orchestrator] ⚠️ DEGRADED MODE: persistence unavailable, continuing without Mongo-backed persistence');
    }
  } else {
    console.log('[orchestrator] fast-start: skipping persistence initialization');
  }

  let indexers: DocIndexer[] = [];
  let indexedDocCount = 0;
  if (!fastStartMode) {
    const indexRoots = [config.docsPath, config.cookbookPath].filter(
      (value): value is string => Boolean(value)
    );
    indexers = indexRoots.map((root) => new DocIndexer(root));
    for (const indexer of indexers) {
      await indexer.buildInitialIndex();
    }
    indexedDocCount = indexers.reduce((sum, indexer) => sum + indexer.getIndex().size, 0);
    console.log(
      `[orchestrator] indexed ${indexedDocCount} docs across ${indexRoots.length} source(s)`
    );
  } else {
    console.log('[orchestrator] fast-start: skipping initial document indexing');
  }

  const state = await loadState(config.stateFile, {
    taskHistoryLimit: config.taskHistoryLimit,
  });
  state.indexedDocs = indexedDocCount;
  state.docIndexVersion += 1;

  const flushState = async () => {
    await persistState(config.stateFile, state, {
      taskHistoryLimit: config.taskHistoryLimit,
    });
  };
  await flushState();

  // Initialize milestone emitter (no-op if milestoneIngestUrl or MILESTONE_SIGNING_SECRET not set)
  const milestoneEmitter = initMilestoneEmitter(config, () => state, flushState);

  const taskHistoryLimit = Number.isFinite(config.taskHistoryLimit)
    ? Math.max(1, Math.min(10000, Math.floor(config.taskHistoryLimit as number)))
    : 50;
  const retryMaxAttempts = Number.isFinite(config.retryMaxAttempts)
    ? Math.max(0, Math.floor(config.retryMaxAttempts as number))
    : 2;
  const retryBackoffMs = Number.isFinite(config.retryBackoffMs)
    ? Math.max(0, Math.floor(config.retryBackoffMs as number))
    : 500;

  const ensureExecutionRecord = (task: Task) => {
    const idempotencyKey =
      typeof task.idempotencyKey === "string" && task.idempotencyKey.trim().length > 0
        ? task.idempotencyKey
        : task.id;
    const existing = state.taskExecutions.find((item) => item.idempotencyKey === idempotencyKey);
    if (existing) {
      return { existing, idempotencyKey };
    }

    const created = {
      taskId: task.id,
      idempotencyKey,
      type: task.type,
      status: "pending" as const,
      attempt: task.attempt ?? 1,
      maxRetries: Number.isFinite(task.maxRetries) ? Number(task.maxRetries) : retryMaxAttempts,
      lastHandledAt: new Date().toISOString(),
      lastError: undefined as string | undefined,
    };
    state.taskExecutions.push(created);
    return { existing: created, idempotencyKey };
  };

  const recordTaskResult = (task: Task, result: "ok" | "error", message?: string) => {
    state.taskHistory.push({
      id: task.id,
      type: task.type,
      handledAt: new Date().toISOString(),
      result,
      message,
    });
    if (state.taskHistory.length > taskHistoryLimit) {
      state.taskHistory.shift();
    }
  };

  const queue = new TaskQueue();
  const handlerContext = {
    config,
    state,
    saveState: flushState,
    logger: console,
  };

  queue.onProcess(async (task) => {
    const { existing: execution, idempotencyKey } = ensureExecutionRecord(task);

    if (execution.status === "success") {
      console.log(`[orchestrator] ♻️ Skipping duplicate task ${task.type} (${idempotencyKey})`);
      return;
    }

    execution.status = "running";
    execution.attempt = task.attempt ?? execution.attempt ?? 1;
    execution.maxRetries = Number.isFinite(task.maxRetries)
      ? Number(task.maxRetries)
      : execution.maxRetries;
    execution.lastHandledAt = new Date().toISOString();

    const approval = assertApprovalIfRequired(task, state, config);
    if (!approval.allowed) {
      onApprovalRequested(task.id, task.type);
      execution.status = "pending";
      recordTaskResult(task, "ok", approval.reason ?? "awaiting approval");
      await flushState();
      console.warn(`[orchestrator] ⏸️ ${task.type}: ${approval.reason ?? 'awaiting approval'}`);
      return;
    }

    const handler = resolveTaskHandler(task);
    try {
      console.log(`[orchestrator] Processing task: ${task.type}`);
      const message = await handler(task, handlerContext);
      execution.status = "success";
      execution.lastError = undefined;
      execution.lastHandledAt = new Date().toISOString();
      recordTaskResult(task, "ok", typeof message === "string" ? message : undefined);
      failureTracker.track(task.type, message);
      console.log(`[orchestrator] ✅ ${task.type}: ${message}`);
    } catch (error) {
      const err = error as Error;
      console.error(`[task] ❌ failed ${task.type}:`, err);
      execution.lastError = err.message;
      execution.lastHandledAt = new Date().toISOString();

      const maxRetries = Number.isFinite(execution.maxRetries)
        ? execution.maxRetries
        : retryMaxAttempts;
      const attempt = Number.isFinite(execution.attempt) ? execution.attempt : 1;

      if (attempt <= maxRetries) {
        execution.status = "retrying";
        const nextAttempt = attempt + 1;
        const retryPayload = {
          ...task.payload,
          __attempt: nextAttempt,
          maxRetries,
          idempotencyKey,
        };
        setTimeout(() => {
          queue.enqueue(task.type, retryPayload);
        }, retryBackoffMs);
      } else {
        execution.status = "failed";
      }

      recordTaskResult(task, "error", err.message);
      failureTracker.track(task.type, undefined, err);
      alertManager.error(`task-${task.type}`, `Task failed: ${err.message}`, {
        taskId: task.id,
        error: err.message,
        stack: err.stack,
      });
    } finally {
      await flushState();
    }
  });

  for (const indexer of indexers) {
    indexer.watch((doc) => {
      queue.enqueue("doc-change", {
        path: doc.path,
        lastModified: doc.lastModified,
      });
    });
  }

  // CRON SCHEDULING (replaces setInterval)

  // 11:00 PM UTC: Nightly batch (doc-sync + mark high-confidence items for drafting)
  cron.schedule(config.nightlyBatchSchedule || "0 23 * * *", () => {
    console.log("[cron] nightly-batch triggered");
    queue.enqueue("nightly-batch", { reason: "scheduled" });
  });

  // 6:00 AM UTC: Send morning digest notification
  cron.schedule(config.morningNotificationSchedule || "0 6 * * *", () => {
    console.log("[cron] send-digest triggered");
    queue.enqueue("send-digest", { reason: "scheduled" });
  });

  // 5-minute heartbeat for health checks (keeps background monitoring)
  let lastHeartbeatTime = Date.now();
  cron.schedule("*/5 * * * *", () => {
    lastHeartbeatTime = Date.now();
    queue.enqueue("heartbeat", { reason: "periodic" });
  });

  // 5-minute milestone delivery retry (delivers pending/retrying records)
  if (!fastStartMode) {
    cron.schedule("*/5 * * * *", () => {
      milestoneEmitter.deliverPending().catch((err) => {
        console.warn("[milestones] poller error:", (err as Error).message);
      });
    });
  }

  // Monitor heartbeat failures (detect if orchestrator is hung)
  setInterval(() => {
    const timeSinceLastHeartbeat = Date.now() - lastHeartbeatTime;
    const heartbeatThreshold = 15 * 60 * 1000; // 15 minutes

    if (timeSinceLastHeartbeat > heartbeatThreshold) {
      alertManager.critical("orchestrator", "Heartbeat missed - orchestrator may be hung", {
        timeSinceLastHeartbeatMs: timeSinceLastHeartbeat,
      });
    }
  }, 10 * 60 * 1000); // Check every 10 minutes

  // Cleanup old alerts periodically
  setInterval(() => {
    alertManager.cleanup(48); // Keep alerts for 48 hours
  }, 6 * 60 * 60 * 1000); // Clean up every 6 hours

  console.log("[orchestrator] 🔔 Alerts configured and monitoring started");
  console.log("[orchestrator] Scheduled 3 cron jobs: nightly-batch (11pm), send-digest (6am), heartbeat (5min)");

  // ============================================================
  // Phase 4: Daily Memory Consolidation System
  // ============================================================
  
  if (!fastStartMode) {
    memoryScheduler.start();
    console.log("[orchestrator] ⏰ Memory consolidation enabled (hourly snapshots, daily consolidation at 1 AM UTC)");
  } else {
    console.log('[orchestrator] fast-start: skipping memory scheduler startup');
  }

  // ============================================================
  // Phase 5: Knowledge Base Automation
  // ============================================================
  
  if (!fastStartMode) {
    await knowledgeIntegration.start();
  } else {
    console.log('[orchestrator] fast-start: skipping knowledge integration startup');
  }

  // ============================================================
  // Setup HTTP Server for Metrics & Alert Webhooks (Phase 2, 3, 5)
  // ============================================================
  
  const app = express();
  const PORT = process.env.PORT || 3000;
  let isShuttingDown = false;
  let forceShutdownTimer: NodeJS.Timeout | null = null;
  
  // Security Middleware Setup
  app.use(validateContentLength(1024 * 1024)); // 1MB limit
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ limit: '1mb' }));
  app.use(logSecurityEvent);
  app.set('trust proxy', 1);

  // ============================================================
  // Public Endpoints (No Authentication Required)
  // ============================================================

  // Health check endpoint - allow monitoring
  app.get("/health", healthLimiter, (req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      metrics: "http://localhost:9100/metrics",
      knowledge: "http://localhost:3000/api/knowledge/summary",
      persistence: "http://localhost:3000/api/persistence/health",
    });
  });

  // Knowledge Base summary endpoint (Phase 5) - Public for dashboards
  app.get("/api/knowledge/summary", apiLimiter, (req, res) => {
    try {
      const summary = knowledgeIntegration.getSummary();
      res.json(summary);
    } catch (error: any) {
      console.error("[api/knowledge/summary] Error", { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/openapi.json", apiLimiter, (_req, res) => {
    res.json(buildOpenApiSpec(PORT));
  });

  // Persistence health endpoint - Public for monitoring
  app.get("/api/persistence/health", healthLimiter, async (req, res) => {
    try {
      const health = await PersistenceIntegration.healthCheck();
      res.json(health);
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // ============================================================
  // Protected Endpoints (Authentication Required)
  // ============================================================

  // Manual task trigger endpoint
  app.post(
    "/api/tasks/trigger",
    apiLimiter,
    authLimiter,
    requireBearerToken,
    createValidationMiddleware(TaskTriggerSchema, 'body'),
    async (req, res) => {
      try {
        const type = String(req.body.type);
        const payload = typeof req.body.payload === 'object' && req.body.payload !== null
          ? (req.body.payload as Record<string, unknown>)
          : {};

        const task = queue.enqueue(type, payload);
        res.status(202).json({
          status: 'queued',
          taskId: task.id,
          type: task.type,
          createdAt: task.createdAt,
        });
      } catch (error: any) {
        console.error("[api/tasks/trigger] Error", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    }
  );

  // AlertManager webhook endpoint (Phase 3)
  // Uses webhook signature verification instead of bearer token
  app.post(
    "/webhook/alerts",
    webhookLimiter,
    authLimiter,
    verifyWebhookSignature,
    createValidationMiddleware(AlertManagerWebhookSchema, 'body'),
    async (req, res) => {
      try {
        console.log("[webhook/alerts] Received alert from AlertManager");
        await alertHandler.handleAlertManagerWebhook(req.body);
        res.json({ status: "ok" });
      } catch (error: any) {
        console.error("[webhook/alerts] Error processing alert", {
          error: error.message,
        });
        res.status(500).json({ error: error.message });
      }
    }
  );

  app.get(
    "/api/approvals/pending",
    apiLimiter,
    authLimiter,
    requireBearerToken,
    async (_req, res) => {
      try {
        const pending = listPendingApprovals(state);
        res.json({
          count: pending.length,
          pending,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  app.post(
    "/api/approvals/:id/decision",
    apiLimiter,
    authLimiter,
    requireBearerToken,
    createValidationMiddleware(ApprovalDecisionSchema, 'body'),
    async (req, res) => {
      try {
        const taskId = String(req.params.id);
        const decision = req.body.decision as 'approved' | 'rejected';
        const actor = typeof req.body.actor === 'string' ? req.body.actor : 'api-user';
        const note = typeof req.body.note === 'string' ? req.body.note : undefined;
        const approval = decideApproval(state, taskId, decision, actor, note);

        onApprovalCompleted(taskId, decision === 'approved' ? 'approved' : 'rejected');

        let replayTaskId: string | null = null;
        if (decision === 'approved') {
          const replay = queue.enqueue(approval.type, {
            ...approval.payload,
            approvedFromTaskId: approval.taskId,
          });
          replayTaskId = replay.id;
        }

        await flushState();

        res.json({
          status: 'ok',
          approval,
          replayTaskId,
        });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    }
  );

  app.get(
    "/api/dashboard/overview",
    apiLimiter,
    authLimiter,
    requireBearerToken,
    async (_req, res) => {
      try {
        const persistence = await PersistenceIntegration.healthCheck();
        const pendingApprovals = listPendingApprovals(state);
        const memory = await buildMemoryOverviewSummary(24);

        res.json({
          generatedAt: new Date().toISOString(),
          health: {
            status: "healthy",
            fastStartMode,
          },
          persistence,
          memory,
          queue: {
            queued: queue.getQueuedCount(),
            processing: queue.getPendingCount(),
          },
          approvals: {
            pendingCount: pendingApprovals.length,
            pending: pendingApprovals,
          },
          recentTasks: state.taskHistory.slice(-20),
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  app.get(
    "/api/memory/recall",
    apiLimiter,
    authLimiter,
    requireBearerToken,
    async (req, res) => {
      try {
        const limit = parseBoundedInt(req.query.limit, 20, 1, 100);
        const offset = parseBoundedInt(req.query.offset, 0, 0, 100000);
        const includeSensitive = parseBoolean(req.query.includeSensitive, false);
        const includeErrors = parseBoolean(req.query.includeErrors, true);
        const agentIdFilter =
          typeof req.query.agentId === "string" && req.query.agentId.trim().length > 0
            ? req.query.agentId.trim()
            : null;

        const registry = await getAgentRegistry();
        const agentIds = registry
          .listAgents()
          .map((agent) => agent.id)
          .filter((id) => (agentIdFilter ? id === agentIdFilter : true));

        const loaded = await Promise.all(
          agentIds.map(async (agentId) => {
            const memory = await loadAgentMemoryState(agentId);
            if (!memory) return null;
            const timeline = includeErrors
              ? memory.taskTimeline ?? []
              : (memory.taskTimeline ?? []).filter((entry) => entry.status !== "error");
            const normalized: AgentMemoryState = {
              ...memory,
              agentId,
              taskTimeline: timeline,
            };
            return redactMemoryState(normalized, includeSensitive);
          }),
        );

        const items = loaded
          .filter((item): item is AgentMemoryState => item !== null)
          .sort((a, b) => {
            const ta = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
            const tb = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
            return tb - ta;
          });

        const page = items.slice(offset, offset + limit);
        const totalRuns = items.reduce((sum, item) => sum + Number(item.totalRuns ?? 0), 0);

        res.json({
          generatedAt: new Date().toISOString(),
          query: {
            agentId: agentIdFilter,
            limit,
            offset,
            includeErrors,
            includeSensitive,
          },
          totalAgents: items.length,
          totalRuns,
          page: {
            returned: page.length,
            offset,
            limit,
            hasMore: offset + page.length < items.length,
          },
          items: page,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  // Knowledge Base Query endpoint (Phase 5)
  app.post(
    "/api/knowledge/query",
    apiLimiter,
    authLimiter,
    requireBearerToken,
    createValidationMiddleware(KBQuerySchema, 'body'),
    async (req, res) => {
      try {
        const { query } = req.body;
        const results = await knowledgeIntegration.queryAPI(query);
        res.json(results);
      } catch (error: any) {
        console.error("[api/knowledge/query] Error", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    }
  );

  // Knowledge Base export endpoint (Phase 5)
  app.get(
    "/api/knowledge/export",
    exportLimiter,
    authLimiter,
    requireBearerToken,
    (req, res) => {
      try {
        const format = (req.query.format as string) || "markdown";
        const kb = knowledgeIntegration.export(format as 'markdown' | 'json');
        
        if (format === 'markdown') {
          res.type('text/markdown').send(kb);
        } else {
          res.json(JSON.parse(kb));
        }
      } catch (error: any) {
        console.error("[api/knowledge/export] Error", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    }
  );

  // Persistence historical data endpoint
  app.get(
    "/api/persistence/historical",
    apiLimiter,
    authLimiter,
    requireBearerToken,
    createValidationMiddleware(PersistenceHistoricalSchema, 'query'),
    async (req, res) => {
      try {
        const days = parseInt((req.query.days as string) || '30', 10);
        const data = await PersistenceIntegration.getHistoricalData(days);
        res.json(data);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  // Persistence export endpoint
  app.get(
    "/api/persistence/export",
    exportLimiter,
    authLimiter,
    requireBearerToken,
    async (req, res) => {
      try {
        const exportData = await PersistenceIntegration.exportAllData();
        res.json(exportData);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  const server = app.listen(PORT, () => {
    console.log(`[orchestrator] HTTP server listening on port ${PORT}`);
    console.log(`[orchestrator] ⚠️  AUTHENTICATION ENABLED - API key required for protected endpoints`);
    console.log(`[orchestrator] Metrics: http://localhost:9100/metrics`);
    console.log(`[orchestrator] Alert webhook: POST http://localhost:${PORT}/webhook/alerts (signature required)`);
    console.log(`[orchestrator] Knowledge query: POST http://localhost:${PORT}/api/knowledge/query (auth required)`);
    console.log(`[orchestrator] Knowledge summary: http://localhost:${PORT}/api/knowledge/summary (public)`);
    console.log(`[orchestrator] Persistence health: http://localhost:${PORT}/api/persistence/health (public)`);
    console.log(`[orchestrator] Health check: http://localhost:${PORT}/health (public)`);
  });

  // ============================================================
  // Graceful Shutdown Handler (Day 10)
  // ============================================================
  
  process.on('SIGTERM', async () => {
    if (isShuttingDown) {
      console.log('[orchestrator] SIGTERM received during shutdown, ignoring duplicate signal');
      return;
    }
    isShuttingDown = true;

    console.log('[orchestrator] Received SIGTERM, starting graceful shutdown...');
    server.close(async () => {
      console.log('[orchestrator] HTTP server closed');
      try {
        await PersistenceIntegration.close();
        console.log('[orchestrator] Database connections closed');
      } catch (err) {
        console.error('[orchestrator] Error closing database:', err);
      }
      try {
        await memoryScheduler.stop();
        console.log('[orchestrator] Memory scheduler stopped');
      } catch (err) {
        console.error('[orchestrator] Error stopping scheduler:', err);
      }
      if (forceShutdownTimer) {
        clearTimeout(forceShutdownTimer);
      }
      console.log('[orchestrator] ✅ Graceful shutdown complete');
      process.exit(0);
    });

    // Force kill after 30 seconds if shutdown hasn't completed
    forceShutdownTimer = setTimeout(() => {
      console.error('[orchestrator] Shutdown timeout, forcing exit');
      process.exit(1);
    }, 30000);
  });

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    console.log('[orchestrator] Received SIGINT, initiating shutdown...');
    process.emit('SIGTERM');
  });

  queue.enqueue("startup", { reason: "orchestrator boot" });
}

bootstrap().catch((err) => {
  console.error("[orchestrator] fatal", err);
  process.exit(1);
});
