import { loadConfig } from "./config.js";
import { DocIndexer } from "./docIndexer.js";
import { TaskQueue } from "./taskQueue.js";
import {
  appendWorkflowEventRecord,
  getRetryRecoveryDelayMs,
  loadState,
  reconcileTaskRetryRecoveryState,
  saveStateWithOptions as persistState,
  summarizeDeliveryRecords,
  summarizeGovernanceVisibility,
  updateRepairRecord,
  upsertRepairRecord,
} from "./state.js";
import {
  ALLOWED_TASK_TYPES,
  consumeReviewQueueItemForApprovalDecision,
  resolveTaskHandler,
} from "./taskHandlers.js";
import {
  AlertManager,
  TaskFailureTracker,
  buildAlertConfig,
} from "./alerter.js";
import {
  ApprovalRecord,
  IncidentLedgerRecord,
  IncidentLedgerStatus,
  IncidentLedgerClassification,
  IncidentLedgerSeverity,
  IncidentLedgerTruthLayer,
  IncidentRemediationOwner,
  IncidentRemediationStatus,
  OrchestratorState,
  Task,
  TaskRetryRecoveryRecord,
  ToolInvocation,
  WorkflowEventRecord,
  WorkflowEventStage,
} from "./types.js";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import cron from "node-cron";
import { startMetricsServer } from "./metrics/index.js";
import { onApprovalCompleted, onApprovalRequested } from "./metrics/index.js";
import { alertHandler } from "./alerts/alert-handler.js";
import { snapshotService } from "./memory/snapshot-service.js";
// memoryScheduler: loaded dynamically at runtime (private module, gitignored).
// Falls back to a no-op so the public build compiles and CI passes.
let memoryScheduler: { start(): void; stop(): Promise<void> | void } = {
  start: () =>
    console.log("[orchestrator] Memory scheduler not available in this build"),
  stop: () => {},
};
import { knowledgeIntegration } from "./knowledge/integration.js";
import { PersistenceIntegration } from "./persistence/index.js";
import { getAgentRegistry } from "./agentRegistry.js";
import { getToolGate } from "./toolGate.js";
import {
  assertApprovalIfRequired,
  decideApproval,
  listPendingApprovals,
} from "./approvalGate.js";
import { buildOpenApiSpec } from "./openapi.js";
import express from "express";
import {
  requireBearerToken,
  requireRole,
  auditProtectedAction,
  verifyWebhookSignature,
  logSecurityEvent,
  verifyKeyRotationPolicy,
} from "./middleware/auth.js";
import type { AuthenticatedRequest } from "./middleware/auth.js";
import {
  createValidationMiddleware,
  validateContentLength,
  AlertManagerWebhookSchema,
  ApprovalDecisionSchema,
  KBQuerySchema,
  IncidentAcknowledgeSchema,
  IncidentOwnerSchema,
  PersistenceHistoricalSchema,
  SkillsAuditQuerySchema,
  TaskRunsQuerySchema,
  TaskTriggerSchema,
} from "./middleware/validation.js";
import {
  webhookLimiter,
  apiLimiter,
  adminExportLimiter,
  healthLimiter,
  authLimiter,
  viewerReadLimiter,
  operatorWriteLimiter,
} from "./middleware/rate-limit.js";
import { getMilestoneEmitter, initMilestoneEmitter } from "./milestones/emitter.js";
import { initDemandSummaryEmitter } from "./demand/emitter.js";

/**
 * Security Posture Verification
 * Ensures critical security requirements are met before startup
 */
function verifySecurityPosture() {
  const requiredEnvVars = [
    "WEBHOOK_SECRET",
    "MONGO_PASSWORD",
    "REDIS_PASSWORD",
    "MONGO_USERNAME",
  ];

  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[SECURITY] Critical environment variables missing: ${missing.join(", ")}. Refusing to start.`,
    );
  }

  const hasRotationKeys = Boolean(process.env.API_KEY_ROTATION?.trim());
  const hasPrimaryKey = Boolean(process.env.API_KEY?.trim());
  if (!hasRotationKeys && !hasPrimaryKey) {
    throw new Error(
      "[SECURITY] Missing auth credentials: set API_KEY_ROTATION (preferred) or API_KEY.",
    );
  }
  if (hasRotationKeys && hasPrimaryKey) {
    console.warn(
      "[SECURITY] Both API_KEY_ROTATION and API_KEY are set; using rotation list as primary credential source.",
    );
  }

  // Verify key rotation policy
  const keyStatus = verifyKeyRotationPolicy();
  if (!keyStatus.valid) {
    throw new Error(
      `[SECURITY] API Key rotation policy violation: ${keyStatus.warnings.join("; ")}`,
    );
  }

  keyStatus.warnings.forEach((w) => {
    console.warn(`[SECURITY] ⚠️ ${w}`);
  });

  console.log(
    "[SECURITY] ✅ Posture verification: PASS (all required credentials configured)",
  );
  console.log("[SECURITY] ✅ Key rotation policy: PASS");
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

type AgentStatusValidation = "confirmed-worker" | "partial-worker" | "not-yet-verified";
type AgentFrontendExposure = "usable-now" | "partial" | "backend-only";
type AgentDependencySensitivity = "low" | "medium" | "high";
type AgentWorkerEvidenceSummary = {
  workerValidationStatus: AgentStatusValidation;
  lastEvidenceAt: string | null;
  evidenceSources: string[];
  lastSuccessfulRunId: string | null;
  lastSuccessfulTaskId: string | null;
  lastToolGateMode: string | null;
  lastToolGateSkillId: string | null;
};

type ClaimedTruthLayer = {
  status: "declared";
  summary: string;
  controlPlane: "orchestrator";
  privateOperatorSurface: string;
  authoritativeHealthRoute: string;
  aggregateOverviewRoute: string;
  publicProofBoundary: "openclawdbot";
  declaredAgents: number;
  allowlistedTaskTypes: number;
  approvalGatedTaskTypes: string[];
  evidence: TruthEvidenceItem[];
  signals: TruthSignal[];
};

type ProofTransportStatus =
  | "not-configured"
  | "misconfigured"
  | "degraded"
  | "catching-up"
  | "publishing"
  | "idle";

type ProofDeliveryTelemetry = {
  boundary: {
    surface: "openclawdbot";
    model: "separate-public-proof-surface";
  };
  signingSecretConfigured: boolean;
  milestone: {
    latestMilestoneId: string | null;
    deliveryStatus: ProofTransportStatus;
    targetConfigured: boolean;
    targetReady: boolean;
    targetUrl: string | null;
    feedConfigured: boolean;
    feedReady: boolean;
    feedPath: string | null;
    gitPushEnabled: boolean;
    ledger: ReturnType<typeof summarizeDeliveryRecords>;
    lastDeliveredAt: string | null;
  };
  demandSummary: {
    latestSummaryId: string | null;
    deliveryStatus: ProofTransportStatus;
    targetConfigured: boolean;
    targetReady: boolean;
    targetUrl: string | null;
    ledger: ReturnType<typeof summarizeDeliveryRecords>;
    lastDeliveredAt: string | null;
  };
  overallStatus: ProofTransportStatus;
};

type TruthEvidenceSeverity = "info" | "warning" | "critical";

type TruthEvidenceItem = {
  id: string;
  label: string;
  status: string;
  detail: string;
  route?: string | null;
  value?: string | number | boolean | null;
};

type TruthSignal = {
  id: string;
  severity: TruthEvidenceSeverity;
  message: string;
  relatedRoutes?: string[];
};

type RuntimeTruthLayers = {
  claimed: ClaimedTruthLayer;
  configured: {
    status: "configured" | "partial" | "local-only";
    summary: string;
    fastStartMode: boolean;
    docsConfigured: boolean;
    cookbookConfigured: boolean;
    stateFileConfigured: boolean;
    milestoneIngestConfigured: boolean;
    milestoneFeedConfigured: boolean;
    demandSummaryIngestConfigured: boolean;
    signingSecretConfigured: boolean;
    proofTransportsConfigured: number;
    evidence: TruthEvidenceItem[];
    signals: TruthSignal[];
  };
  observed: {
    status: "stable" | "warning" | "degraded";
    summary: string;
    queue: {
      queued: number;
      processing: number;
    };
    approvals: {
      pendingCount: number;
    };
    repairs: {
      activeCount: number;
      verifiedCount: number;
      failedCount: number;
      lastDetectedAt: string | null;
    };
    retryRecoveries: {
      count: number;
      nextRetryAt: string | null;
    };
    recentTasks: {
      count: number;
      lastHandledAt: string | null;
    };
    persistenceStatus: string;
    knowledgeIndexedEntries: number;
    lastMilestoneDeliveryAt: string | null;
    lastDemandSummaryDeliveryAt: string | null;
    evidence: TruthEvidenceItem[];
    signals: TruthSignal[];
  };
  public: {
    status: ProofTransportStatus;
    summary: string;
    boundary: "openclawdbot";
    milestoneStatus: ProofTransportStatus;
    demandSummaryStatus: ProofTransportStatus;
    lastMilestoneDeliveryAt: string | null;
    lastDemandSummaryDeliveryAt: string | null;
    deadLetterCount: number;
    evidence: TruthEvidenceItem[];
    signals: TruthSignal[];
  };
};

type TopologyNodeKind = "control-plane" | "task" | "agent" | "skill" | "surface";
type TopologyNodeStatus = "declared" | "live" | "warning" | "degraded";
type TopologyEdgeRelationship =
  | "dispatches-task"
  | "routes-to-agent"
  | "uses-skill"
  | "publishes-proof";
type TopologyEdgeStatus = "declared" | "live" | "warning" | "degraded";

type AgentTopologyNode = {
  id: string;
  kind: TopologyNodeKind;
  label: string;
  status: TopologyNodeStatus;
  detail: string;
  route?: string | null;
};

type AgentTopologyEdge = {
  id: string;
  from: string;
  to: string;
  relationship: TopologyEdgeRelationship;
  status: TopologyEdgeStatus;
  detail: string;
  evidence: string[];
};

type AgentTopology = {
  generatedAt: string;
  status: "stable" | "warning" | "degraded";
  counts: {
    controlPlaneNodes: number;
    taskNodes: number;
    agentNodes: number;
    skillNodes: number;
    surfaceNodes: number;
    totalNodes: number;
    dispatchEdges: number;
    routeEdges: number;
    skillEdges: number;
    proofEdges: number;
    totalEdges: number;
  };
  hotspots: string[];
  nodes: AgentTopologyNode[];
  edges: AgentTopologyEdge[];
};

type RuntimeIncident = {
  id: string;
  fingerprint: string;
  title: string;
  classification: IncidentLedgerClassification;
  severity: IncidentLedgerSeverity;
  status: IncidentLedgerStatus;
  truthLayer: IncidentLedgerTruthLayer;
  summary: string;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  detectedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgementNote: string | null;
  owner: string | null;
  affectedSurfaces: string[];
  linkedServiceIds: string[];
  linkedTaskIds: string[];
  linkedRunIds: string[];
  linkedRepairIds: string[];
  linkedProofDeliveries: string[];
  evidence: string[];
  recommendedSteps: string[];
  remediation: {
    owner: IncidentRemediationOwner;
    status: IncidentRemediationStatus;
    summary: string;
    nextAction: string;
    blockers: string[];
  };
};

type RuntimeIncidentModel = {
  generatedAt: string;
  overallStatus: "stable" | "warning" | "critical";
  openCount: number;
  activeCount: number;
  watchingCount: number;
  bySeverity: {
    critical: number;
    warning: number;
    info: number;
  };
  incidents: RuntimeIncident[];
};

type RunWorkflowStage =
  | "queued"
  | "awaiting-approval"
  | "executing"
  | "retry-scheduled"
  | "completed"
  | "failed";

type RunWorkflowEvent = {
  id: string;
  stage:
    | "queue"
    | "approval"
    | "execution"
    | "retry"
    | "repair"
    | "history"
    | "status";
  state: string;
  source: "execution" | "approval" | "retry-recovery" | "repair" | "history";
  timestamp: string | null;
  message: string;
  evidence: string[];
};

type WorkflowGraphNodeStatus =
  | "pending"
  | "active"
  | "completed"
  | "blocked"
  | "warning";

type WorkflowGraphNode = {
  id: string;
  kind: "stage" | "agent" | "proof";
  stage: WorkflowEventStage;
  label: string;
  status: WorkflowGraphNodeStatus;
  timestamp: string | null;
  detail: string;
  evidence: string[];
};

type WorkflowGraphEdge = {
  id: string;
  from: string;
  to: string;
  status: "declared" | "active" | "completed" | "blocked";
  detail: string;
};

type WorkflowGraph = {
  graphStatus: "stable" | "warning" | "blocked" | "completed";
  currentStage: WorkflowEventStage | null;
  blockedStage: WorkflowEventStage | null;
  stopReason: string | null;
  stageDurations: Partial<Record<WorkflowEventStage, number>>;
  nodeCount: number;
  edgeCount: number;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  events: WorkflowEventRecord[];
  proofLinks: Array<{
    id: string;
    type: "milestone" | "demandSummary";
    status: string;
    summary: string;
    target: string | null;
    lastAttemptAt: string | null;
  }>;
};

type AgentCapabilitySpine =
  | "truth"
  | "execution"
  | "trust"
  | "communication"
  | "ingestion"
  | "code";

type AgentCapabilityReadiness =
  | "declared"
  | "foundation"
  | "operational"
  | "advanced";

type ApprovalImpactMetadata = {
  riskLevel: "low" | "medium" | "high";
  approvalReason:
    | "policy-task-type"
    | "payload-requires-approval"
    | "policy-and-payload";
  dependencyClass: "control-plane" | "worker" | "external";
  purpose: string;
  operationalStatus:
    | "confirmed-working"
    | "partially-operational"
    | "externally-dependent"
    | "unconfirmed";
  affectedSurfaces: string[];
  dependencyRequirements: string[];
  caveats: string[];
  replayBehavior: "approval-requeues-same-payload";
  internalOnly: boolean;
  publicTriggerable: boolean;
};

type OperatorTaskProfile = {
  type: string;
  label: string;
  purpose: string;
  internalOnly: boolean;
  publicTriggerable: boolean;
  approvalGated: boolean;
  operationalStatus:
    | "confirmed-working"
    | "partially-operational"
    | "externally-dependent"
    | "unconfirmed";
  dependencyClass: "control-plane" | "worker" | "external";
  baselineConfidence: "high" | "medium" | "low";
  dependencyRequirements: string[];
  exposeInV1: boolean;
  caveats: string[];
};

const OPERATOR_TASK_PROFILES: OperatorTaskProfile[] = [
  {
    type: "heartbeat",
    label: "Heartbeat",
    purpose: "Fast control-plane liveness check through the normal queue path.",
    internalOnly: false,
    publicTriggerable: true,
    approvalGated: false,
    operationalStatus: "confirmed-working",
    dependencyClass: "control-plane",
    baselineConfidence: "high",
    dependencyRequirements: ["task queue"],
    exposeInV1: true,
    caveats: [],
  },
  {
    type: "build-refactor",
    label: "Build Refactor",
    purpose: "Run bounded refactor/build workflow through the spawned worker path.",
    internalOnly: false,
    publicTriggerable: true,
    approvalGated: true,
    operationalStatus: "confirmed-working",
    dependencyClass: "worker",
    baselineConfidence: "medium",
    dependencyRequirements: ["spawned worker", "tool permissions", "approval gate"],
    exposeInV1: true,
    caveats: [
      "Approval required before execution.",
      "Queue acceptance does not imply downstream completion certainty.",
    ],
  },
  {
    type: "market-research",
    label: "Market Research",
    purpose: "Run market research worker with query-first and optional URL fetch mode.",
    internalOnly: false,
    publicTriggerable: true,
    approvalGated: false,
    operationalStatus: "partially-operational",
    dependencyClass: "external",
    baselineConfidence: "medium",
    dependencyRequirements: ["spawned worker", "network fetch"],
    exposeInV1: true,
    caveats: [
      "Query-only mode is currently the most reliable path.",
      "URL mode is more dependency-sensitive.",
    ],
  },
  {
    type: "doc-sync",
    label: "Doc Sync",
    purpose: "Drain pending doc-change buffer into synchronized state.",
    internalOnly: false,
    publicTriggerable: true,
    approvalGated: false,
    operationalStatus: "unconfirmed",
    dependencyClass: "control-plane",
    baselineConfidence: "low",
    dependencyRequirements: ["doc change queue"],
    exposeInV1: false,
    caveats: ["Admin-only in V1.", "Not confirmed as fully healthy in the latest sweep."],
  },
  {
    type: "nightly-batch",
    label: "Nightly Batch",
    purpose: "Run nightly coordination batch across docs and demand queue.",
    internalOnly: false,
    publicTriggerable: true,
    approvalGated: false,
    operationalStatus: "unconfirmed",
    dependencyClass: "worker",
    baselineConfidence: "low",
    dependencyRequirements: ["scheduler", "rss sweep", "worker queue"],
    exposeInV1: false,
    caveats: ["Admin-only in V1.", "Also executed by schedule; avoid duplicate manual triggering."],
  },
  {
    type: "drift-repair",
    label: "Drift Repair",
    purpose: "Repair documentation/runtime drift and regenerate knowledge context.",
    internalOnly: false,
    publicTriggerable: true,
    approvalGated: false,
    operationalStatus: "partially-operational",
    dependencyClass: "worker",
    baselineConfidence: "medium",
    dependencyRequirements: ["doc-specialist worker", "knowledge pack write"],
    exposeInV1: false,
    caveats: ["Downstream worker flow currently degraded."],
  },
  {
    type: "reddit-response",
    label: "Reddit Response",
    purpose: "Draft community responses from queued demand signals.",
    internalOnly: false,
    publicTriggerable: true,
    approvalGated: false,
    operationalStatus: "partially-operational",
    dependencyClass: "external",
    baselineConfidence: "medium",
    dependencyRequirements: ["reddit-helper pipeline", "model provider", "network"],
    exposeInV1: false,
    caveats: ["Community pipeline path is currently degraded."],
  },
  {
    type: "send-digest",
    label: "Send Digest",
    purpose: "Send digest notifications for queued lead work.",
    internalOnly: false,
    publicTriggerable: true,
    approvalGated: false,
    operationalStatus: "partially-operational",
    dependencyClass: "external",
    baselineConfidence: "medium",
    dependencyRequirements: ["notification channel config", "network"],
    exposeInV1: false,
    caveats: ["Notification path depends on external channel configuration."],
  },
  {
    type: "rss-sweep",
    label: "RSS Sweep",
    purpose: "Ingest and score RSS feed entries for demand queue drafting.",
    internalOnly: false,
    publicTriggerable: true,
    approvalGated: false,
    operationalStatus: "externally-dependent",
    dependencyClass: "external",
    baselineConfidence: "low",
    dependencyRequirements: ["rss config", "network"],
    exposeInV1: false,
    caveats: ["Requires valid feed config and external network availability."],
  },
  {
    type: "agent-deploy",
    label: "Agent Deploy",
    purpose: "Deploy agent template instances to runtime deployment directory.",
    internalOnly: false,
    publicTriggerable: true,
    approvalGated: true,
    operationalStatus: "unconfirmed",
    dependencyClass: "worker",
    baselineConfidence: "low",
    dependencyRequirements: ["approval gate", "filesystem write"],
    exposeInV1: false,
    caveats: ["Approval required before execution.", "Not confirmed end-to-end in latest sweep."],
  },
  {
    type: "startup",
    label: "Startup",
    purpose: "Internal boot task used by orchestrator runtime initialization.",
    internalOnly: true,
    publicTriggerable: false,
    approvalGated: false,
    operationalStatus: "unconfirmed",
    dependencyClass: "control-plane",
    baselineConfidence: "low",
    dependencyRequirements: ["orchestrator startup path"],
    exposeInV1: false,
    caveats: ["Internal-only task. Must not be exposed as user-runnable."],
  },
  {
    type: "doc-change",
    label: "Doc Change",
    purpose: "Internal watcher signal for document delta tracking.",
    internalOnly: true,
    publicTriggerable: false,
    approvalGated: false,
    operationalStatus: "unconfirmed",
    dependencyClass: "control-plane",
    baselineConfidence: "low",
    dependencyRequirements: ["doc watcher"],
    exposeInV1: false,
    caveats: ["Internal-only task. Must not be exposed as user-runnable."],
  },
];

const TASK_AGENT_SKILL_REQUIREMENTS: Record<
  string,
  { agentId: string; skillId: string }
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
  "normalize-data": {
    agentId: "normalization-agent",
    skillId: "normalizer",
  },
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

const TASK_IMPACT_SURFACES: Record<string, string[]> = {
  heartbeat: ["control-plane", "task-queue"],
  "build-refactor": ["workspace", "worker-runtime", "tool-permissions"],
  "market-research": ["external-network", "research-artifacts"],
  "doc-sync": ["document-index", "knowledge-packs", "orchestrator-state"],
  "nightly-batch": ["document-index", "demand-queue", "scheduled-workflows"],
  "drift-repair": ["document-index", "knowledge-packs", "repair-queue"],
  "reddit-response": ["demand-queue", "community-drafts", "model-provider"],
  "send-digest": ["digest-artifacts", "notification-channel", "external-network"],
  "rss-sweep": ["rss-feeds", "demand-queue", "draft-scoring"],
  "agent-deploy": ["agent-runtime", "deployment-filesystem", "worker-templates"],
  startup: ["control-plane"],
  "doc-change": ["document-watchers", "pending-doc-buffer"],
};

const CONFIRMED_WORKER_AGENTS = new Set([
  "build-refactor-agent",
  "market-research-agent",
]);
const PARTIAL_WORKER_AGENTS = new Set(["doc-specialist", "reddit-helper"]);

const AGENT_CAPABILITY_TARGETS: Record<
  string,
  {
    role: string;
    spine: AgentCapabilitySpine;
    targetCapabilities: string[];
  }
> = {
  "doc-specialist": {
    role: "Repository intelligence engine",
    spine: "truth",
    targetCapabilities: [
      "knowledge indexing",
      "drift detection",
      "pack generation",
      "runtime evidence grounding",
      "doc repair drafting",
    ],
  },
  "integration-agent": {
    role: "Workflow conductor",
    spine: "execution",
    targetCapabilities: [
      "workflow planning",
      "delegation routing",
      "fallback routing",
      "blocked-state explanation",
      "workflow evidence emission",
    ],
  },
  "system-monitor-agent": {
    role: "Operational fusion monitor",
    spine: "trust",
    targetCapabilities: [
      "service telemetry fusion",
      "queue telemetry fusion",
      "incident detection",
      "proof freshness monitoring",
      "budget posture awareness",
    ],
  },
  "security-agent": {
    role: "Trust-boundary auditor",
    spine: "trust",
    targetCapabilities: [
      "policy auditing",
      "secret posture review",
      "permission drift detection",
      "route-boundary review",
      "bounded remediation guidance",
    ],
  },
  "qa-verification-agent": {
    role: "Final verifier",
    spine: "trust",
    targetCapabilities: [
      "output verification",
      "reproducibility checks",
      "policy alignment review",
      "regression checks",
      "acceptance gating",
    ],
  },
  "reddit-helper": {
    role: "Community strategist",
    spine: "communication",
    targetCapabilities: [
      "knowledge-grounded drafting",
      "queue triage",
      "signal routing",
      "public communication feedback",
      "reply verification",
    ],
  },
  "content-agent": {
    role: "Evidence-based publisher",
    spine: "communication",
    targetCapabilities: [
      "documentation drafting",
      "release-note drafting",
      "proof narrative drafting",
      "repo-grounded publishing",
      "operator summary writing",
    ],
  },
  "summarization-agent": {
    role: "Compression layer",
    spine: "communication",
    targetCapabilities: [
      "log summarization",
      "run summarization",
      "audit summarization",
      "pack compression",
      "context reduction",
    ],
  },
  "data-extraction-agent": {
    role: "External artifact ingestor",
    spine: "ingestion",
    targetCapabilities: [
      "document parsing",
      "artifact extraction",
      "source normalization handoff",
      "structured evidence capture",
      "external artifact triage",
    ],
  },
  "normalization-agent": {
    role: "Schema and ETL normalizer",
    spine: "ingestion",
    targetCapabilities: [
      "schema normalization",
      "ETL cleanup",
      "validation mapping",
      "typed output shaping",
      "ingestion standardization",
    ],
  },
  "build-refactor-agent": {
    role: "Governed code surgeon",
    spine: "code",
    targetCapabilities: [
      "bounded patching",
      "build validation",
      "test execution",
      "rollback-aware refactoring",
      "repair-safe edits",
    ],
  },
  "market-research-agent": {
    role: "External signal intake",
    spine: "ingestion",
    targetCapabilities: [
      "web research",
      "competitive signal tracking",
      "external change detection",
      "signal-to-pack handoff",
      "source evidence capture",
    ],
  },
  "skill-audit-agent": {
    role: "Governed skill auditor",
    spine: "trust",
    targetCapabilities: [
      "skill review",
      "permission review",
      "governance evidence capture",
      "supply-chain visibility",
      "audit summarization",
    ],
  },
};
const DEFAULT_CORS_METHODS = ["GET", "POST"];
const DEFAULT_CORS_HEADERS = ["Authorization", "Content-Type"];
const DEFAULT_CORS_EXPOSED_HEADERS = [
  "X-Request-Id",
  "X-API-Key-Expires",
  "ratelimit-limit",
  "ratelimit-remaining",
  "ratelimit-reset",
  "Retry-After",
];

type RuntimeCorsPolicy = {
  allowedOrigins: Set<string>;
  allowedMethods: string[];
  allowedHeaders: string[];
  allowedHeadersLower: Set<string>;
  exposedHeaders: string[];
  allowCredentials: boolean;
  maxAgeSeconds: number;
};

function parseBoundedInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  return Math.max(min, Math.min(max, floored));
}

function getOperatorTaskProfile(taskType: string): OperatorTaskProfile | null {
  return OPERATOR_TASK_PROFILES.find((profile) => profile.type === taskType) ?? null;
}

function summarizePayloadPreview(payload: Record<string, unknown>) {
  const keys = Object.keys(payload).filter((key) => key !== "__raw");
  const internalKeys = keys.filter((key) => key.startsWith("__"));
  const visibleKeys = keys.filter((key) => !key.startsWith("__"));

  return {
    keyCount: keys.length,
    keys: visibleKeys,
    internalKeyCount: internalKeys.length,
  };
}

function deriveApprovalReason(
  approval: ApprovalRecord,
  config: Awaited<ReturnType<typeof loadConfig>>,
): ApprovalImpactMetadata["approvalReason"] {
  const explicit = approval.payload.requiresApproval === true;
  const policyRequiredTaskTypes = new Set(
    (config.approvalRequiredTaskTypes ?? ["agent-deploy", "build-refactor"]).map(
      (item) => String(item),
    ),
  );
  const policy = policyRequiredTaskTypes.has(approval.type);

  if (policy && explicit) return "policy-and-payload";
  if (explicit) return "payload-requires-approval";
  return "policy-task-type";
}

function deriveApprovalRiskLevel(profile: OperatorTaskProfile | null): ApprovalImpactMetadata["riskLevel"] {
  if (!profile) return "medium";
  if (profile.type === "agent-deploy" || profile.type === "build-refactor") return "high";
  if (profile.dependencyClass === "external") return "medium";
  if (profile.dependencyClass === "control-plane") return "low";
  return "medium";
}

function buildApprovalImpactMetadata(
  approval: ApprovalRecord,
  config: Awaited<ReturnType<typeof loadConfig>>,
): ApprovalImpactMetadata {
  const profile = getOperatorTaskProfile(approval.type);

  return {
    riskLevel: deriveApprovalRiskLevel(profile),
    approvalReason: deriveApprovalReason(approval, config),
    dependencyClass: profile?.dependencyClass ?? "worker",
    purpose: profile?.purpose ?? "Runtime allowlisted task pending approval.",
    operationalStatus: profile?.operationalStatus ?? "unconfirmed",
    affectedSurfaces:
      TASK_IMPACT_SURFACES[approval.type] ??
      [profile?.dependencyClass === "external" ? "external-network" : "worker-runtime"],
    dependencyRequirements: profile?.dependencyRequirements ?? [],
    caveats: profile?.caveats ?? [],
    replayBehavior: "approval-requeues-same-payload",
    internalOnly: profile?.internalOnly ?? false,
    publicTriggerable: profile?.publicTriggerable ?? true,
  };
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeCorsOrigin(rawOrigin: string): string {
  if (rawOrigin === "null") {
    throw new Error("CORS origin 'null' is not supported");
  }
  const parsed = new URL(rawOrigin);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(
      `CORS origin must use http/https protocol: ${rawOrigin}`,
    );
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(
      `CORS origin must not include path/query/fragment: ${rawOrigin}`,
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error(
      `CORS origin must not include credentials: ${rawOrigin}`,
    );
  }
  return `${parsed.protocol}//${parsed.host}`.toLowerCase();
}

function normalizeCorsMethod(rawMethod: string): string {
  const method = rawMethod.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(method)) {
    throw new Error(`Invalid CORS method token: ${rawMethod}`);
  }
  return method;
}

function normalizeCorsHeader(rawHeader: string): string {
  const header = rawHeader.trim();
  if (!/^[A-Za-z0-9-]+$/.test(header)) {
    throw new Error(`Invalid CORS header token: ${rawHeader}`);
  }
  return header;
}

function normalizeCorsList(
  rawValues: string[] | undefined,
  fallback: string[],
  normalizer: (value: string) => string,
) {
  const input = rawValues && rawValues.length > 0 ? rawValues : fallback;
  const normalizedValues = input.map((value) => normalizer(String(value)));
  return Array.from(new Set(normalizedValues));
}

function buildCorsPolicy(
  config: Awaited<ReturnType<typeof loadConfig>>,
): RuntimeCorsPolicy {
  const allowedOrigins = new Set(
    (config.corsAllowedOrigins ?? []).map((origin) =>
      normalizeCorsOrigin(String(origin)),
    ),
  );
  const configuredMethods = normalizeCorsList(
    config.corsAllowedMethods,
    DEFAULT_CORS_METHODS,
    normalizeCorsMethod,
  );
  const allowedMethods = Array.from(
    new Set([...configuredMethods, "OPTIONS"]),
  );
  const allowedHeaders = normalizeCorsList(
    config.corsAllowedHeaders,
    DEFAULT_CORS_HEADERS,
    normalizeCorsHeader,
  );
  const allowedHeadersLower = new Set(
    allowedHeaders.map((header) => header.toLowerCase()),
  );
  const exposedHeaders = normalizeCorsList(
    config.corsExposedHeaders,
    DEFAULT_CORS_EXPOSED_HEADERS,
    normalizeCorsHeader,
  );
  const allowCredentials = config.corsAllowCredentials === true;
  const maxAgeSeconds = Number.isFinite(config.corsMaxAgeSeconds)
    ? Math.max(
        0,
        Math.min(86400, Math.floor(config.corsMaxAgeSeconds as number)),
      )
    : 600;

  return {
    allowedOrigins,
    allowedMethods,
    allowedHeaders,
    allowedHeadersLower,
    exposedHeaders,
    allowCredentials,
    maxAgeSeconds,
  };
}

function requestOriginFromHost(req: express.Request): string | null {
  const host = req.get("host");
  if (!host) return null;
  return `${req.protocol}://${host}`.toLowerCase();
}

function isCorsOriginAllowed(
  req: express.Request,
  corsPolicy: RuntimeCorsPolicy,
  rawOrigin: string,
): boolean {
  let normalizedOrigin: string;
  try {
    normalizedOrigin = normalizeCorsOrigin(rawOrigin);
  } catch {
    return false;
  }

  if (corsPolicy.allowedOrigins.has(normalizedOrigin)) {
    return true;
  }

  const sameOrigin = requestOriginFromHost(req);
  return sameOrigin === normalizedOrigin;
}

function redactMemoryState(
  state: AgentMemoryState,
  includeSensitive: boolean,
): AgentMemoryState {
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

async function loadAgentMemoryState(
  agentId: string,
): Promise<AgentMemoryState | null> {
  const agentConfigPath = join(
    process.cwd(),
    "..",
    "agents",
    agentId,
    "agent.config.json",
  );
  try {
    const configRaw = await readFile(agentConfigPath, "utf-8");
    const config = JSON.parse(configRaw) as { serviceStatePath?: string };
    if (!config.serviceStatePath) return null;

    const serviceStatePath = resolve(
      dirname(agentConfigPath),
      config.serviceStatePath,
    );
    const stateRaw = await readFile(serviceStatePath, "utf-8");
    return JSON.parse(stateRaw) as AgentMemoryState;
  } catch {
    return null;
  }
}

async function pathExists(pathToCheck: string): Promise<boolean> {
  try {
    await stat(pathToCheck);
    return true;
  } catch {
    return false;
  }
}

function toTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveToolInvocationMode(invocation: ToolInvocation): string | null {
  if (typeof invocation.mode === "string" && invocation.mode.length > 0) {
    return invocation.mode;
  }
  const argsMode =
    invocation.args &&
    typeof invocation.args === "object" &&
    typeof invocation.args.mode === "string"
      ? invocation.args.mode
      : null;
  return argsMode && argsMode.length > 0 ? argsMode : null;
}

export function deriveWorkerEvidenceSummary(args: {
  agentId: string;
  spawnedWorkerCapable: boolean;
  orchestratorTask?: string | null;
  memory: AgentMemoryState | null;
  taskExecutions: OrchestratorState["taskExecutions"];
  toolInvocations: ToolInvocation[];
}): AgentWorkerEvidenceSummary {
  const {
    agentId,
    spawnedWorkerCapable,
    orchestratorTask,
    memory,
    taskExecutions,
    toolInvocations,
  } = args;

  const relevantExecutions = orchestratorTask
    ? [...taskExecutions]
        .filter((item) => item.type === orchestratorTask)
        .sort((a, b) => b.lastHandledAt.localeCompare(a.lastHandledAt))
    : [];
  const relevantToolInvocations = toolInvocations
    .filter((item) => item.agentId === agentId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const latestObservedExecution = relevantExecutions[0] ?? null;
  const latestSuccessfulExecution =
    relevantExecutions.find((item) => item.status === "success") ?? null;
  const latestAllowedPreflight =
    relevantToolInvocations.find(
      (item) => item.allowed && resolveToolInvocationMode(item) === "preflight",
    ) ?? null;
  const latestAllowedExecute =
    relevantToolInvocations.find(
      (item) => item.allowed && resolveToolInvocationMode(item) === "execute",
    ) ?? null;
  const latestToolInvocation = relevantToolInvocations[0] ?? null;

  const memoryHasRun =
    Boolean(memory?.lastRunAt) || Number(memory?.totalRuns ?? 0) > 0;
  const memorySuccess = memory?.lastStatus === "success" && memoryHasRun;
  const liveConfirmedEvidence =
    spawnedWorkerCapable &&
    Boolean(
      (latestSuccessfulExecution && memorySuccess) ||
        (latestSuccessfulExecution && latestAllowedExecute) ||
        (memorySuccess && latestAllowedExecute),
    );
  const observedEvidence =
    spawnedWorkerCapable &&
    Boolean(
      latestObservedExecution || memoryHasRun || latestAllowedPreflight || latestAllowedExecute,
    );

  const evidenceSources = new Set<string>();
  if (latestSuccessfulExecution) {
    evidenceSources.add("task-run-success");
  } else if (latestObservedExecution) {
    evidenceSources.add(`task-run-${latestObservedExecution.status}`);
  }
  if (memoryHasRun) {
    evidenceSources.add(memorySuccess ? "agent-memory-success" : "agent-memory");
  }
  if (latestAllowedPreflight) {
    evidenceSources.add("toolgate-preflight");
  }
  if (latestAllowedExecute) {
    evidenceSources.add("toolgate-execute");
  }

  let workerValidationStatus: AgentStatusValidation;
  if (liveConfirmedEvidence || CONFIRMED_WORKER_AGENTS.has(agentId)) {
    workerValidationStatus = "confirmed-worker";
    if (!liveConfirmedEvidence && CONFIRMED_WORKER_AGENTS.has(agentId)) {
      evidenceSources.add("validation-sweep-baseline");
    }
  } else if (PARTIAL_WORKER_AGENTS.has(agentId) || observedEvidence) {
    workerValidationStatus = "partial-worker";
    if (!observedEvidence && PARTIAL_WORKER_AGENTS.has(agentId)) {
      evidenceSources.add("validation-sweep-baseline");
    }
  } else {
    workerValidationStatus = "not-yet-verified";
  }

  const lastEvidenceAtCandidates = [
    latestSuccessfulExecution?.lastHandledAt ?? null,
    latestObservedExecution?.lastHandledAt ?? null,
    memory?.lastRunAt ?? null,
    latestToolInvocation?.timestamp ?? null,
  ].filter((value): value is string => Boolean(value));

  const lastEvidenceAt =
    lastEvidenceAtCandidates.length > 0
      ? [...lastEvidenceAtCandidates].sort(
          (a, b) => toTimestamp(b) - toTimestamp(a),
        )[0]
      : null;

  return {
    workerValidationStatus,
    lastEvidenceAt,
    evidenceSources: Array.from(evidenceSources.values()),
    lastSuccessfulRunId: latestSuccessfulExecution?.idempotencyKey ?? null,
    lastSuccessfulTaskId: latestSuccessfulExecution?.taskId ?? null,
    lastToolGateMode: latestToolInvocation
      ? resolveToolInvocationMode(latestToolInvocation)
      : null,
    lastToolGateSkillId: latestToolInvocation?.skillId ?? null,
  };
}

function resolveDependencySensitivity(agentId: string): AgentDependencySensitivity {
  if (agentId === "market-research-agent" || agentId === "reddit-helper") {
    return "high";
  }
  if (agentId === "doc-specialist") {
    return "medium";
  }
  return "low";
}

function resolveAgentFrontendExposure(
  workerValidationStatus: AgentStatusValidation,
  serviceImplementation: boolean,
  spawnedWorkerCapable: boolean,
): AgentFrontendExposure {
  if (workerValidationStatus === "confirmed-worker") {
    return "usable-now";
  }
  if (serviceImplementation || spawnedWorkerCapable) {
    return "partial";
  }
  return "backend-only";
}

function buildAgentCapabilityReadiness(args: {
  agent: {
    id: string;
    model?: { tier?: string | null };
    permissions?: { skills?: Record<string, { allowed: boolean }> };
  };
  orchestratorTask: string | null;
  spawnedWorkerCapable: boolean;
  serviceAvailable: boolean;
  serviceInstalled: boolean | null;
  serviceRunning: boolean | null;
  memory: AgentMemoryState | null;
  workerEvidence: AgentWorkerEvidenceSummary;
  state: OrchestratorState;
}) {
  const {
    agent,
    orchestratorTask,
    spawnedWorkerCapable,
    serviceAvailable,
    serviceInstalled,
    serviceRunning,
    memory,
    workerEvidence,
    state,
  } = args;

  const target = AGENT_CAPABILITY_TARGETS[agent.id] ?? {
    role: "Specialized agent",
    spine: "execution" as AgentCapabilitySpine,
    targetCapabilities: ["runtime execution", "evidence grounding"],
  };
  const modelTier =
    typeof agent.model?.tier === "string" && agent.model.tier.length > 0
      ? agent.model.tier
      : null;
  const allowedSkills = Object.entries(agent.permissions?.skills ?? {})
    .filter(([, permission]) => permission.allowed)
    .map(([skillId]) => skillId);
  const memoryHasRun =
    Boolean(memory?.lastRunAt) || Number(memory?.totalRuns ?? 0) > 0;
  const verifiedRepairCount = state.repairRecords.filter((record) => {
    if (record.status !== "verified") return false;
    if (orchestratorTask && record.repairTaskType === orchestratorTask) return true;
    if (orchestratorTask && record.sourceTaskType === orchestratorTask) return true;
    return false;
  }).length;

  const evidence: string[] = [];
  const presentCapabilities: string[] = [];
  const missingCapabilities: string[] = [];

  if (modelTier) {
    evidence.push(`model tier declared: ${modelTier}`);
    presentCapabilities.push("tiered model declaration");
  } else {
    missingCapabilities.push("tiered model declaration");
  }

  if (allowedSkills.length > 0) {
    evidence.push(`allowed skills: ${allowedSkills.join(", ")}`);
    presentCapabilities.push("governed skill access");
  } else {
    missingCapabilities.push("governed skill access");
  }

  if (spawnedWorkerCapable) {
    evidence.push("spawned worker entrypoint detected");
    presentCapabilities.push("spawned worker path");
  }
  if (serviceAvailable) {
    evidence.push("service entrypoint detected");
    presentCapabilities.push("service entrypoint");
  }
  if (!spawnedWorkerCapable && !serviceAvailable) {
    missingCapabilities.push("runtime execution path");
  }

  if (serviceInstalled === true) {
    evidence.push("service unit installed on host");
    presentCapabilities.push("host-installed service");
  }
  if (serviceRunning === true) {
    evidence.push("service unit running on host");
    presentCapabilities.push("live service coverage");
  } else if (serviceAvailable) {
    missingCapabilities.push("live service coverage");
  }

  if (workerEvidence.lastSuccessfulRunId) {
    evidence.push(`successful run evidence: ${workerEvidence.lastSuccessfulRunId}`);
    presentCapabilities.push("successful runtime evidence");
  } else {
    missingCapabilities.push("successful runtime evidence");
  }

  if (workerEvidence.lastToolGateMode === "execute") {
    evidence.push("tool execution evidence observed");
    presentCapabilities.push("tool execution evidence");
  } else if (workerEvidence.lastToolGateMode === "preflight") {
    evidence.push("tool preflight evidence observed");
    missingCapabilities.push("tool execution evidence");
  } else {
    missingCapabilities.push("tool execution evidence");
  }

  if (memoryHasRun) {
    evidence.push("agent memory has run history");
    presentCapabilities.push("memory-backed operational evidence");
  } else {
    missingCapabilities.push("memory-backed operational evidence");
  }

  if (verifiedRepairCount > 0) {
    evidence.push(`${verifiedRepairCount} verified repair-linked run(s) observed`);
    presentCapabilities.push("verification or repair evidence");
  } else {
    missingCapabilities.push("verification or repair evidence");
  }

  const readiness =
    workerEvidence.lastSuccessfulRunId &&
    allowedSkills.length > 0 &&
    (serviceRunning === true || memoryHasRun) &&
    workerEvidence.lastToolGateMode === "execute"
      ? ("advanced" as AgentCapabilityReadiness)
      : workerEvidence.lastSuccessfulRunId &&
          allowedSkills.length > 0 &&
          (spawnedWorkerCapable || serviceAvailable)
        ? ("operational" as AgentCapabilityReadiness)
        : (modelTier || allowedSkills.length > 0) &&
            (spawnedWorkerCapable || serviceAvailable)
          ? ("foundation" as AgentCapabilityReadiness)
          : ("declared" as AgentCapabilityReadiness);

  const uniqueMissing = [...new Set(missingCapabilities)];

  return {
    role: target.role,
    spine: target.spine,
    currentReadiness: readiness,
    evidence,
    presentCapabilities: [...new Set(presentCapabilities)],
    missingCapabilities: uniqueMissing,
    ultraGapSummary:
      uniqueMissing.length > 0
        ? `${uniqueMissing.length} capability gap${uniqueMissing.length === 1 ? "" : "s"} remain before this agent can be treated as ultra-capable in-role.`
        : "Runtime evidence covers the current ultra-agent target checks exposed by the control plane.",
  };
}

type HostServiceUnitState = {
  id: string;
  loadState: string | null;
  activeState: string | null;
  subState: string | null;
  unitFileState: string | null;
};

type CachedHostServiceStates = {
  expiresAt: number;
  states: Map<string, HostServiceUnitState>;
};

const SERVICE_STATE_PROBE_TTL_MS = 5000;
let cachedHostServiceStates: CachedHostServiceStates | null = null;

function getAgentServiceUnitName(agentId: string) {
  return `${agentId}.service`;
}

export function parseSystemctlShowOutput(raw: string) {
  const states = new Map<string, HostServiceUnitState>();
  const blocks = raw
    .trim()
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const record: HostServiceUnitState = {
      id: "",
      loadState: null,
      activeState: null,
      subState: null,
      unitFileState: null,
    };

    for (const line of block.split(/\r?\n/)) {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex);
      const value = line.slice(separatorIndex + 1) || null;

      switch (key) {
        case "Id":
          record.id = value ?? "";
          break;
        case "LoadState":
          record.loadState = value;
          break;
        case "ActiveState":
          record.activeState = value;
          break;
        case "SubState":
          record.subState = value;
          break;
        case "UnitFileState":
          record.unitFileState = value;
          break;
        default:
          break;
      }
    }

    if (record.id) {
      states.set(record.id, record);
    }
  }

  return states;
}

export function resolveServiceInstalledState(
  unitState: HostServiceUnitState | null | undefined,
) {
  if (!unitState) {
    return null as boolean | null;
  }
  if (unitState.loadState === "not-found") {
    return false;
  }
  if (unitState.loadState) {
    return true;
  }
  return null as boolean | null;
}

export function resolveServiceRunningState(
  unitState: HostServiceUnitState | null | undefined,
) {
  if (!unitState) {
    return null as boolean | null;
  }
  if (unitState.loadState === "not-found") {
    return false;
  }
  if (unitState.activeState === "active") {
    return true;
  }
  if (unitState.activeState) {
    return false;
  }
  return null as boolean | null;
}

function getHostServiceStates(agentIds: string[]) {
  const now = Date.now();
  if (cachedHostServiceStates && cachedHostServiceStates.expiresAt > now) {
    return cachedHostServiceStates.states;
  }

  if (process.platform !== "linux") {
    return null as Map<string, HostServiceUnitState> | null;
  }

  const unitNames = agentIds.map((agentId) => getAgentServiceUnitName(agentId));
  try {
    const raw = execFileSync(
      "systemctl",
      [
        "show",
        ...unitNames,
        "--property=Id,LoadState,ActiveState,SubState,UnitFileState",
        "--no-pager",
      ],
      {
        encoding: "utf-8",
        timeout: 1500,
        maxBuffer: 1024 * 1024,
      },
    );
    const states = parseSystemctlShowOutput(raw);
    cachedHostServiceStates = {
      expiresAt: now + SERVICE_STATE_PROBE_TTL_MS,
      states,
    };
    return states;
  } catch (error) {
    const raw =
      error && typeof error === "object" && "stdout" in error
        ? String((error as { stdout?: string }).stdout ?? "")
        : "";
    if (!raw.trim()) {
      return null as Map<string, HostServiceUnitState> | null;
    }
    const states = parseSystemctlShowOutput(raw);
    cachedHostServiceStates = {
      expiresAt: now + SERVICE_STATE_PROBE_TTL_MS,
      states,
    };
    return states;
  }
}

export async function buildAgentOperationalOverview(state: OrchestratorState) {
  const registry = await getAgentRegistry();
  const gate = await getToolGate();
  const toolInvocations = gate.getLog().invocations;
  const agents = registry.listAgents();
  const baseAgentsPath = join(process.cwd(), "..", "agents");
  const hostServiceStates = getHostServiceStates(agents.map((agent) => agent.id));

  return Promise.all(
    agents.map(async (agent) => {
      const typedAgent = agent as typeof agent & { orchestratorTask?: string };
      const agentRoot = join(baseAgentsPath, typedAgent.id);
      const indexEntryPath = join(agentRoot, "src", "index.ts");
      const serviceEntryPath = join(agentRoot, "src", "service.ts");

      const [spawnedWorkerCapable, serviceImplementation, memory] = await Promise.all([
        pathExists(indexEntryPath),
        pathExists(serviceEntryPath),
        loadAgentMemoryState(typedAgent.id),
      ]);

      const workerEvidence = deriveWorkerEvidenceSummary({
        agentId: typedAgent.id,
        spawnedWorkerCapable,
        orchestratorTask:
          typeof typedAgent.orchestratorTask === "string"
            ? typedAgent.orchestratorTask
            : null,
        memory,
        taskExecutions: state.taskExecutions,
        toolInvocations,
      });
      const serviceAvailable = serviceImplementation;
      const unitName = getAgentServiceUnitName(typedAgent.id);
      const hostUnitState = hostServiceStates?.get(unitName) ?? null;
      const serviceInstalled = resolveServiceInstalledState(hostUnitState);
      const serviceRunning = resolveServiceRunningState(hostUnitState);
      const serviceOperational = serviceRunning === true;
      const allowedSkills = registry.getAllowedSkills(typedAgent.id);
      const dependencySensitivity = resolveDependencySensitivity(typedAgent.id);
      const frontendExposure = resolveAgentFrontendExposure(
        workerEvidence.workerValidationStatus,
        serviceAvailable,
        spawnedWorkerCapable,
      );
      const capability = buildAgentCapabilityReadiness({
        agent: typedAgent,
        orchestratorTask:
          typeof typedAgent.orchestratorTask === "string"
            ? typedAgent.orchestratorTask
            : null,
        spawnedWorkerCapable,
        serviceAvailable,
        serviceInstalled,
        serviceRunning,
        memory,
        workerEvidence,
        state,
      });

      const notes: string[] = [];
      if (!serviceAvailable) {
        notes.push("No long-running service implementation detected (src/service.ts missing).");
      }
      if (serviceAvailable && serviceInstalled === false) {
        notes.push("Service entrypoint exists, but no installed systemd unit was found on this host.");
      }
      if (serviceAvailable && serviceInstalled === true && serviceRunning !== true) {
        const stateLabel = [hostUnitState?.activeState, hostUnitState?.subState]
          .filter((value): value is string => typeof value === "string" && value.length > 0)
          .join("/");
        notes.push(
          `Service unit is installed but not running${stateLabel ? ` (${stateLabel})` : ""}.`,
        );
      }
      if (serviceAvailable && serviceInstalled === null && serviceRunning !== true) {
        notes.push("Service entrypoint exists, but running state is not host-proven by the orchestrator.");
      }
      if (!spawnedWorkerCapable) {
        notes.push("Spawned worker entrypoint missing (src/index.ts not found).");
      }
      if (workerEvidence.workerValidationStatus === "not-yet-verified") {
        notes.push("Spawned-worker path is declared but not yet verified in latest validation sweep.");
      }
      if (workerEvidence.workerValidationStatus === "partial-worker") {
        notes.push("Worker path exists but is currently partial/degraded.");
      }

      return {
        id: typedAgent.id,
        name: typedAgent.name,
        description:
          typeof typedAgent.description === "string"
            ? typedAgent.description
            : null,
        orchestratorTask:
          typeof typedAgent.orchestratorTask === "string"
            ? typedAgent.orchestratorTask
            : null,
        modelTier:
          typeof typedAgent.model?.tier === "string" ? typedAgent.model.tier : null,
        allowedSkills,
        declared: true,
        spawnedWorkerCapable,
        workerValidationStatus: workerEvidence.workerValidationStatus,
        lastEvidenceAt: workerEvidence.lastEvidenceAt,
        evidenceSources: workerEvidence.evidenceSources,
        lastSuccessfulRunId: workerEvidence.lastSuccessfulRunId,
        lastSuccessfulTaskId: workerEvidence.lastSuccessfulTaskId,
        lastToolGateMode: workerEvidence.lastToolGateMode,
        lastToolGateSkillId: workerEvidence.lastToolGateSkillId,
        serviceAvailable,
        serviceInstalled,
        serviceRunning,
        serviceUnitState: hostUnitState?.activeState ?? null,
        serviceUnitSubState: hostUnitState?.subState ?? null,
        serviceUnitFileState: hostUnitState?.unitFileState ?? null,
        serviceImplementation,
        serviceOperational,
        dependencySensitivity,
        frontendExposure,
        capability,
        memory: memory
          ? {
              lastRunAt: memory.lastRunAt ?? null,
              lastStatus: memory.lastStatus ?? null,
              totalRuns: Number(memory.totalRuns ?? 0),
              successCount: Number(memory.successCount ?? 0),
              errorCount: Number(memory.errorCount ?? 0),
            }
          : null,
        notes,
      };
    }),
  );
}

function buildTaskTelemetryOverlay(state: OrchestratorState, taskType: string) {
  const executions = state.taskExecutions.filter((item) => item.type === taskType);
  const total = executions.length;
  const success = executions.filter((item) => item.status === "success").length;
  const failed = executions.filter((item) => item.status === "failed").length;
  const retrying = executions.filter((item) => item.status === "retrying").length;

  return {
    totalRuns: total,
    successRate: total > 0 ? Number((success / total).toFixed(4)) : null,
    failureRate: total > 0 ? Number((failed / total).toFixed(4)) : null,
    retryingCount: retrying,
    latencyVarianceMs: null,
    driftSignals: retrying > 0 || failed > 0,
  };
}

function buildOperatorTaskCatalog(
  config: Awaited<ReturnType<typeof loadConfig>>,
  state: OrchestratorState,
) {
  const approvalRequired = new Set(
    (config.approvalRequiredTaskTypes ?? ["agent-deploy", "build-refactor"]).map(
      (taskType) => String(taskType),
    ),
  );
  const profileByType = new Map(
    OPERATOR_TASK_PROFILES.map((profile) => [profile.type, profile]),
  );

  return ALLOWED_TASK_TYPES.map((taskType) => {
    const profile = profileByType.get(taskType);
    if (!profile) {
      return {
        type: taskType,
        label: taskType,
        purpose: "Runtime allowlisted task.",
        internalOnly: false,
        publicTriggerable: true,
        approvalGated: approvalRequired.has(taskType),
        operationalStatus: "unconfirmed" as const,
        dependencyClass: "worker" as const,
        baselineConfidence: "low" as const,
        dependencyRequirements: [],
        exposeInV1: false,
        caveats: ["No operator-facing classification recorded yet."],
        telemetryOverlay: buildTaskTelemetryOverlay(state, taskType),
      };
    }

    return {
      ...profile,
      approvalGated: profile.approvalGated || approvalRequired.has(taskType),
      telemetryOverlay: buildTaskTelemetryOverlay(state, taskType),
    };
  });
}

function normalizeIsoTimestamp(value?: string | null) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

const WORKFLOW_STAGE_ORDER: WorkflowEventStage[] = [
  "ingress",
  "queue",
  "approval",
  "agent",
  "repair",
  "result",
  "proof",
];

function summarizeEvidence(evidence: string[], limit: number = 6) {
  return [...new Set(evidence.filter(Boolean))].slice(0, limit);
}

function buildWorkflowEventId(
  runId: string,
  stage: WorkflowEventStage,
  state: string,
  timestamp: string,
  nodeId: string,
  detail: string,
) {
  const digest = createHash("sha1")
    .update([runId, stage, state, timestamp, nodeId, detail].join("|"))
    .digest("hex")
    .slice(0, 12);
  return `workflow:${stage}:${digest}`;
}

function appendWorkflowEvent(args: {
  state: OrchestratorState;
  runId: string;
  taskId: string;
  type: string;
  stage: WorkflowEventStage;
  stateLabel: string;
  source: string;
  actor?: string | null;
  nodeId: string;
  detail: string;
  evidence?: string[];
  timestamp?: string;
}) {
  const timestamp = normalizeIsoTimestamp(args.timestamp) ?? new Date().toISOString();
  const detail = args.detail.trim();
  const event: WorkflowEventRecord = {
    eventId: buildWorkflowEventId(
      args.runId,
      args.stage,
      args.stateLabel,
      timestamp,
      args.nodeId,
      detail,
    ),
    runId: args.runId,
    taskId: args.taskId,
    type: args.type,
    stage: args.stage,
    state: args.stateLabel,
    timestamp,
    source: args.source,
    actor:
      typeof args.actor === "string" && args.actor.trim().length > 0
        ? args.actor.trim()
        : "system",
    nodeId: args.nodeId,
    detail,
    evidence: summarizeEvidence(args.evidence ?? []),
  };

  const existing = args.state.workflowEvents.find(
    (record) => record.eventId === event.eventId,
  );
  if (existing) return existing;

  appendWorkflowEventRecord(args.state, event);
  return event;
}

function mapWorkflowEventStageToLegacy(
  stage: WorkflowEventStage,
): RunWorkflowEvent["stage"] {
  if (stage === "ingress" || stage === "queue") return "queue";
  if (stage === "approval") return "approval";
  if (stage === "agent") return "execution";
  if (stage === "result") return "status";
  if (stage === "proof") return "status";
  return "repair";
}

function buildRunWorkflowEventsFromLedger(events: WorkflowEventRecord[]) {
  return sortTimelineEvents(
    events.map((event) => ({
      id: event.eventId,
      stage: mapWorkflowEventStageToLegacy(event.stage),
      state: event.state,
      source: [
        "approval",
        "repair",
        "history",
        "retry-recovery",
      ].includes(event.source)
        ? (event.source as RunWorkflowEvent["source"])
        : "execution",
      timestamp: normalizeIsoTimestamp(event.timestamp),
      message: event.detail,
      evidence: summarizeEvidence(event.evidence),
    })),
  );
}

function deriveWorkflowStageTimestamps(events: WorkflowEventRecord[]) {
  const timestamps: Partial<Record<WorkflowEventStage, number>> = {};
  for (const stage of WORKFLOW_STAGE_ORDER) {
    const stageEvents = events
      .filter((event) => event.stage === stage)
      .map((event) => Date.parse(event.timestamp))
      .filter((value) => Number.isFinite(value));
    if (stageEvents.length > 0) {
      timestamps[stage] = Math.min(...stageEvents);
    }
  }
  return timestamps;
}

function buildWorkflowStageDurations(events: WorkflowEventRecord[]) {
  const timestamps = deriveWorkflowStageTimestamps(events);
  const durations: Partial<Record<WorkflowEventStage, number>> = {};

  for (let index = 0; index < WORKFLOW_STAGE_ORDER.length; index += 1) {
    const stage = WORKFLOW_STAGE_ORDER[index];
    const nextStage = WORKFLOW_STAGE_ORDER[index + 1];
    const start = timestamps[stage];
    const next = nextStage ? timestamps[nextStage] : undefined;
    if (typeof start !== "number" || typeof next !== "number" || next < start) {
      continue;
    }
    durations[stage] = next - start;
  }

  return durations;
}

function sortWorkflowEventRecords(events: WorkflowEventRecord[]) {
  return [...events].sort((left, right) => {
    const leftTs = Date.parse(left.timestamp);
    const rightTs = Date.parse(right.timestamp);
    if (!Number.isFinite(leftTs) && !Number.isFinite(rightTs)) {
      return left.eventId.localeCompare(right.eventId);
    }
    if (!Number.isFinite(leftTs)) return 1;
    if (!Number.isFinite(rightTs)) return -1;
    if (leftTs === rightTs) {
      return left.eventId.localeCompare(right.eventId);
    }
    return leftTs - rightTs;
  });
}

function sortTimelineEvents(events: RunWorkflowEvent[]) {
  return [...events].sort((left, right) => {
    if (!left.timestamp && !right.timestamp) return left.id.localeCompare(right.id);
    if (!left.timestamp) return 1;
    if (!right.timestamp) return -1;
    return left.timestamp.localeCompare(right.timestamp);
  });
}

function buildProofLinksForRun(
  state: OrchestratorState,
  execution: OrchestratorState["taskExecutions"][number],
) {
  const milestoneLinks = state.milestoneDeliveries
    .filter(
      (record) =>
        record.sourceRunId === execution.idempotencyKey ||
        record.sourceTaskId === execution.taskId,
    )
    .map((record) => ({
      id: record.idempotencyKey,
      type: "milestone" as const,
      status: record.status,
      summary: record.event.claim,
      target: record.event.scope ?? null,
      lastAttemptAt: record.lastAttemptAt ?? null,
    }));

  const demandLinks = state.demandSummaryDeliveries
    .filter(
      (record) =>
        record.sourceRunId === execution.idempotencyKey ||
        record.sourceTaskId === execution.taskId,
    )
    .map((record) => ({
      id: record.idempotencyKey,
      type: "demandSummary" as const,
      status: record.status,
      summary: `Demand summary ${record.summaryId}`,
      target: record.snapshot.summaryId ?? null,
      lastAttemptAt: record.lastAttemptAt ?? null,
    }));

  return [...milestoneLinks, ...demandLinks];
}

function buildWorkflowGraph(args: {
  execution: OrchestratorState["taskExecutions"][number];
  approval: ApprovalRecord | null;
  repair: OrchestratorState["repairRecords"][number] | null;
  workflowEvents: WorkflowEventRecord[];
  proofLinks: WorkflowGraph["proofLinks"];
}) {
  const { execution, approval, repair, workflowEvents, proofLinks } = args;
  const stageDurations = buildWorkflowStageDurations(workflowEvents);
  const requirement = TASK_AGENT_SKILL_REQUIREMENTS[execution.type];
  const hasApprovalStage =
    Boolean(approval) || workflowEvents.some((event) => event.stage === "approval");
  const hasRepairStage =
    Boolean(repair) || workflowEvents.some((event) => event.stage === "repair");
  const hasProofStage =
    proofLinks.length > 0 || workflowEvents.some((event) => event.stage === "proof");

  const currentStage: WorkflowEventStage | null =
    approval?.status === "pending"
      ? "approval"
      : repair?.status === "running"
        ? "repair"
        : execution.status === "running"
          ? "agent"
          : execution.status === "retrying"
            ? "result"
            : hasProofStage &&
                proofLinks.some((link) =>
                  ["pending", "retrying", "dead-letter", "rejected"].includes(link.status),
                )
              ? "proof"
              : execution.status === "success" || execution.status === "failed"
                ? "result"
                : workflowEvents.at(-1)?.stage ?? null;

  const blockedStage: WorkflowEventStage | null =
    approval?.status === "pending" || approval?.status === "rejected"
      ? "approval"
      : repair?.status === "failed"
        ? "repair"
        : execution.status === "failed" || execution.status === "retrying"
          ? "result"
          : proofLinks.some((link) =>
                ["dead-letter", "rejected", "retrying"].includes(link.status),
              )
            ? "proof"
            : null;

  const stopReason =
    approval?.status === "pending"
      ? "Awaiting operator approval."
      : approval?.status === "rejected"
        ? approval.note ?? "Approval was rejected by an operator."
        : repair?.status === "failed"
          ? repair.lastError ?? repair.verificationSummary ?? "Repair flow failed."
          : execution.lastError ?? null;

  const graphStatus: WorkflowGraph["graphStatus"] =
    blockedStage === "approval" || blockedStage === "repair" || blockedStage === "result"
      ? "blocked"
      : hasProofStage &&
          proofLinks.some((link) => ["dead-letter", "rejected", "retrying"].includes(link.status))
        ? "warning"
        : execution.status === "success" &&
            (!hasProofStage ||
              proofLinks.every((link) => ["delivered", "duplicate"].includes(link.status)))
          ? "completed"
          : execution.status === "pending"
            ? "stable"
          : execution.status === "running"
            ? "stable"
            : "warning";

  const stageLabels: Record<WorkflowEventStage, string> = {
    ingress: "Ingress",
    queue: "Queue",
    approval: "Approval",
    agent: requirement?.agentId ?? "Agent",
    result: "Result",
    proof: "Proof",
    repair: "Repair",
  };

  const stageNodes = WORKFLOW_STAGE_ORDER.filter((stage) => {
    if (stage === "approval") return hasApprovalStage;
    if (stage === "repair") return hasRepairStage;
    if (stage === "proof") return hasProofStage;
    return true;
  }).map<WorkflowGraphNode>((stage) => {
    const stageEvents = workflowEvents.filter((event) => event.stage === stage);
    const latest = stageEvents.at(-1) ?? null;
    const status: WorkflowGraphNodeStatus =
      blockedStage === stage
        ? "blocked"
        : currentStage === stage && graphStatus !== "completed"
          ? "active"
          : latest
            ? "completed"
            : "pending";

    return {
      id: `workflow-node:${stage}`,
      kind: stage === "agent" ? "agent" : stage === "proof" ? "proof" : "stage",
      stage,
      label: stageLabels[stage],
      status,
      timestamp: latest?.timestamp ?? null,
      detail:
        latest?.detail ??
        (stage === "approval"
          ? "Approval gate state is derived from the orchestrator approval ledger."
          : stage === "proof"
            ? "Proof-delivery state is derived from milestone and demand transport ledgers."
            : `${stageLabels[stage]} stage declared for this run.`),
      evidence: summarizeEvidence(latest?.evidence ?? []),
    };
  });

  const edges = stageNodes.slice(0, -1).map<WorkflowGraphEdge>((node, index) => {
    const next = stageNodes[index + 1];
    const blocked = blockedStage === node.stage || blockedStage === next.stage;
    return {
      id: `workflow-edge:${node.id}:${next.id}`,
      from: node.id,
      to: next.id,
      status: blocked
        ? "blocked"
        : node.status === "completed" && next.status !== "pending"
          ? "completed"
          : currentStage === next.stage
            ? "active"
            : "declared",
      detail: `${node.label} -> ${next.label}`,
    };
  });

  return {
    graphStatus,
    currentStage,
    blockedStage,
    stopReason,
    stageDurations,
    nodeCount: stageNodes.length,
    edgeCount: edges.length,
    nodes: stageNodes,
    edges,
    events: workflowEvents,
    proofLinks,
  };
}

function buildRunWorkflowEvents({
  execution,
  history,
  approval,
  retryRecovery,
  repair,
  workflowEvents,
}: {
  execution: OrchestratorState["taskExecutions"][number];
  history: OrchestratorState["taskHistory"];
  approval: ApprovalRecord | null;
  retryRecovery: OrchestratorState["taskRetryRecoveries"][number] | null;
  repair: OrchestratorState["repairRecords"][number] | null;
  workflowEvents: WorkflowEventRecord[];
}) {
  if (workflowEvents.length > 0) {
    return buildRunWorkflowEventsFromLedger(workflowEvents);
  }

  const events: RunWorkflowEvent[] = [];
  const queueTimestamp =
    normalizeIsoTimestamp(approval?.requestedAt) ??
    normalizeIsoTimestamp(history[0]?.handledAt) ??
    normalizeIsoTimestamp(retryRecovery?.scheduledAt) ??
    normalizeIsoTimestamp(execution.lastHandledAt);

  events.push({
    id: `queue:${execution.idempotencyKey}`,
    stage: "queue",
    state: "queued",
    source: "execution",
    timestamp: queueTimestamp,
    message: `${execution.type} entered orchestrator tracking.`,
    evidence: [execution.taskId, execution.idempotencyKey],
  });

  if (approval) {
    events.push({
      id: `approval-requested:${approval.taskId}`,
      stage: "approval",
      state: approval.status,
      source: "approval",
      timestamp: normalizeIsoTimestamp(approval.requestedAt),
      message: `Approval requested for ${approval.type}.`,
      evidence: Object.keys(approval.payload ?? {}).filter((key) => key !== "__raw"),
    });

    if (approval.decidedAt) {
      events.push({
        id: `approval-decided:${approval.taskId}`,
        stage: "approval",
        state: approval.status,
        source: "approval",
        timestamp: normalizeIsoTimestamp(approval.decidedAt),
        message:
          approval.status === "approved"
            ? `Approval granted${approval.decidedBy ? ` by ${approval.decidedBy}` : ""}.`
            : `Approval rejected${approval.decidedBy ? ` by ${approval.decidedBy}` : ""}.`,
        evidence: [approval.note ?? "no-operator-note"],
      });
    }
  }

  for (const [index, entry] of history.entries()) {
    events.push({
      id: `history:${execution.idempotencyKey}:${index}`,
      stage: "history",
      state: entry.result,
      source: "history",
      timestamp: normalizeIsoTimestamp(entry.handledAt),
      message: entry.message ?? `Task recorded outcome ${entry.result}.`,
      evidence: [entry.type, entry.id],
    });
  }

  if (retryRecovery) {
    events.push({
      id: `retry-scheduled:${retryRecovery.idempotencyKey}`,
      stage: "retry",
      state: "scheduled",
      source: "retry-recovery",
      timestamp: normalizeIsoTimestamp(retryRecovery.scheduledAt),
      message: `Retry ${retryRecovery.attempt} scheduled for ${retryRecovery.type}.`,
      evidence: [retryRecovery.retryAt, String(retryRecovery.maxRetries)],
    });
    events.push({
      id: `retry-due:${retryRecovery.idempotencyKey}`,
      stage: "retry",
      state: "due",
      source: "retry-recovery",
      timestamp: normalizeIsoTimestamp(retryRecovery.retryAt),
      message: `Retry becomes eligible for requeue.`,
      evidence: [retryRecovery.sourceTaskId, retryRecovery.idempotencyKey],
    });
  }

  if (repair) {
    events.push({
      id: `repair-detected:${repair.repairId}`,
      stage: "repair",
      state: repair.status,
      source: "repair",
      timestamp: normalizeIsoTimestamp(repair.detectedAt),
      message: `Repair record ${repair.repairId} detected (${repair.classification}).`,
      evidence: repair.evidence ?? [],
    });

    if (repair.startedAt) {
      events.push({
        id: `repair-started:${repair.repairId}`,
        stage: "repair",
        state: "running",
        source: "repair",
        timestamp: normalizeIsoTimestamp(repair.startedAt),
        message: `Repair execution started.`,
        evidence: repair.evidence ?? [],
      });
    }

    const repairTerminalAt =
      normalizeIsoTimestamp(repair.verifiedAt) ??
      normalizeIsoTimestamp(repair.completedAt);
    if (repairTerminalAt) {
      events.push({
        id: `repair-terminal:${repair.repairId}`,
        stage: "repair",
        state: repair.status,
        source: "repair",
        timestamp: repairTerminalAt,
        message:
          repair.status === "verified"
            ? repair.verificationSummary ?? "Repair verified successfully."
            : repair.lastError ?? repair.verificationSummary ?? "Repair reached a terminal state.",
        evidence: repair.evidence ?? [],
      });
    }
  }

  events.push({
    id: `status:${execution.idempotencyKey}`,
    stage: "status",
    state: execution.status,
    source: "execution",
    timestamp: normalizeIsoTimestamp(execution.lastHandledAt),
    message:
      execution.lastError && execution.lastError.trim().length > 0
        ? execution.lastError
        : `Run is currently ${execution.status}.`,
    evidence: [execution.taskId, execution.type],
  });

  return sortTimelineEvents(events);
}

function deriveRunWorkflowStage(
  execution: OrchestratorState["taskExecutions"][number],
  approval: ApprovalRecord | null,
) {
  if (approval?.status === "pending" && execution.status === "pending") {
    return "awaiting-approval" as RunWorkflowStage;
  }
  if (execution.status === "running") return "executing" as RunWorkflowStage;
  if (execution.status === "retrying") return "retry-scheduled" as RunWorkflowStage;
  if (execution.status === "success") return "completed" as RunWorkflowStage;
  if (execution.status === "failed") return "failed" as RunWorkflowStage;
  return "queued" as RunWorkflowStage;
}

function buildRunRecord(
  execution: OrchestratorState["taskExecutions"][number],
  state: OrchestratorState,
  config: Awaited<ReturnType<typeof loadConfig>>,
) {
  const relatedHistory = state.taskHistory.filter((entry) => entry.id === execution.taskId);
  const sortedHistory = [...relatedHistory].sort((a, b) =>
    a.handledAt.localeCompare(b.handledAt),
  );
  const firstSeenAt = sortedHistory[0]?.handledAt ?? execution.lastHandledAt;
  const requirement = TASK_AGENT_SKILL_REQUIREMENTS[execution.type];
  const relatedRepair =
    state.repairRecords.find(
      (record) =>
        record.repairRunId === execution.idempotencyKey ||
        record.repairTaskId === execution.taskId ||
        record.sourceRunId === execution.idempotencyKey,
    ) ?? null;
  const relatedApproval =
    state.approvals.find((record) => record.taskId === execution.taskId) ?? null;
  const relatedRetryRecovery =
    state.taskRetryRecoveries.find(
      (record) => record.idempotencyKey === execution.idempotencyKey,
    ) ?? null;
  const relatedWorkflowEvents = sortWorkflowEventRecords(
    state.workflowEvents.filter(
      (record) =>
        record.runId === execution.idempotencyKey ||
        (record.taskId === execution.taskId &&
          record.runId === execution.idempotencyKey),
    ),
  );
  const proofLinks = buildProofLinksForRun(state, execution);
  const workflowEvents = buildRunWorkflowEvents({
    execution,
    history: sortedHistory,
    approval: relatedApproval,
    retryRecovery: relatedRetryRecovery,
    repair: relatedRepair,
    workflowEvents: relatedWorkflowEvents,
  });
  const workflowGraph = buildWorkflowGraph({
    execution,
    approval: relatedApproval,
    repair: relatedRepair,
    workflowEvents: relatedWorkflowEvents,
    proofLinks,
  });
  const createdAt =
    workflowEvents[0]?.timestamp ?? normalizeIsoTimestamp(firstSeenAt) ?? null;
  const completedAt =
    execution.status === "success" || execution.status === "failed"
      ? normalizeIsoTimestamp(execution.lastHandledAt)
      : null;
  const latestEventAt = workflowEvents.at(-1)?.timestamp ?? null;

  return {
    run_id: execution.idempotencyKey,
    task_id: execution.taskId,
    created_at: firstSeenAt,
    runId: execution.idempotencyKey,
    taskId: execution.taskId,
    createdAt,
    completedAt,
    status: execution.status,
    actor: "unknown",
    agent_id: requirement?.agentId ?? null,
    skill_id: requirement?.skillId ?? null,
    agentId: requirement?.agentId ?? null,
    skillId: requirement?.skillId ?? null,
    model: null,
    cost: null,
    latency: null,
    logs_ref: config.logsDir,
    logsRef: config.logsDir,
    artifact_refs: [] as string[],
    artifactRefs: [] as string[],
    type: execution.type,
    attempt: execution.attempt,
    maxRetries: execution.maxRetries,
    lastHandledAt: execution.lastHandledAt,
    lastError: execution.lastError ?? null,
    history: sortedHistory,
    approval: relatedApproval
      ? {
          required: true,
          status: relatedApproval.status,
          requestedAt: relatedApproval.requestedAt,
          decidedAt: relatedApproval.decidedAt ?? null,
          decidedBy: relatedApproval.decidedBy ?? null,
          note: relatedApproval.note ?? null,
        }
      : {
          required: false,
          status: null,
          requestedAt: null,
          decidedAt: null,
          decidedBy: null,
          note: null,
        },
    workflow: {
      stage: deriveRunWorkflowStage(execution, relatedApproval),
      graphStatus: workflowGraph.graphStatus,
      currentStage: workflowGraph.currentStage,
      blockedStage: workflowGraph.blockedStage,
      stopReason: workflowGraph.stopReason,
      awaitingApproval:
        relatedApproval?.status === "pending" && execution.status === "pending",
      retryScheduled: execution.status === "retrying",
      nextRetryAt: relatedRetryRecovery?.retryAt ?? null,
      repairStatus: relatedRepair?.status ?? null,
      eventCount: workflowEvents.length,
      latestEventAt,
      stageDurations: workflowGraph.stageDurations,
      nodeCount: workflowGraph.nodeCount,
      edgeCount: workflowGraph.edgeCount,
    },
    events: workflowEvents,
    workflowGraph,
    proofLinks,
    repair: relatedRepair
      ? {
          repairId: relatedRepair.repairId,
          classification: relatedRepair.classification,
          status: relatedRepair.status,
          trigger: relatedRepair.trigger,
          verificationMode: relatedRepair.verificationMode,
          verificationSummary: relatedRepair.verificationSummary ?? null,
          detectedAt: relatedRepair.detectedAt,
          startedAt: relatedRepair.startedAt ?? null,
          completedAt: relatedRepair.completedAt ?? null,
          verifiedAt: relatedRepair.verifiedAt ?? null,
          lastError: relatedRepair.lastError ?? null,
          evidence: relatedRepair.evidence ?? [],
        }
      : null,
  };
}

async function buildMemoryOverviewSummary(staleAfterHours: number = 24) {
  const registry = await getAgentRegistry();
  const agentIds = registry.listAgents().map((agent) => agent.id);
  const staleCutoff = Date.now() - staleAfterHours * 60 * 60 * 1000;

  let missingCount = 0;
  let staleCount = 0;
  let errorStateCount = 0;
  let totalRuns = 0;

  const samples: Array<{
    agentId: string;
    reason: string;
    lastRunAt?: string | null;
  }> = [];

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
      if (samples.length < 10)
        samples.push({ agentId, reason: "never-run", lastRunAt });
    } else {
      const ts = new Date(lastRunAt).getTime();
      if (!Number.isFinite(ts) || ts < staleCutoff) {
        staleCount += 1;
        if (samples.length < 10)
          samples.push({ agentId, reason: "stale", lastRunAt });
      }
    }

    if (lastStatus === "error") {
      errorStateCount += 1;
      if (samples.length < 10)
        samples.push({ agentId, reason: "error", lastRunAt });
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

function buildKnowledgeRuntimeSignals({
  summary,
  config,
  state,
}: {
  summary: any;
  config: Awaited<ReturnType<typeof loadConfig>>;
  state: OrchestratorState;
}) {
  const totalEntries = Number(summary?.stats?.total ?? 0);
  const totalConcepts = Number(summary?.networkStats?.totalConcepts ?? 0);
  const freshness = summary?.diagnostics?.freshness ?? null;
  const contradictionSignals = Array.isArray(summary?.diagnostics?.contradictionSignals)
    ? summary.diagnostics.contradictionSignals
    : [];
  const coverageSignals: Array<{
    id: string;
    severity: "info" | "warning";
    message: string;
  }> = [];
  const stalenessSignals: Array<{
    id: string;
    severity: "info" | "warning";
    message: string;
  }> = [];

  if (state.indexedDocs > 0 && totalEntries === 0) {
    coverageSignals.push({
      id: "knowledge-coverage-gap",
      severity: "warning",
      message:
        "Document roots are indexed, but the knowledge base has no persisted entries yet.",
    });
  }

  if (totalEntries > 0 && totalConcepts === 0) {
    coverageSignals.push({
      id: "knowledge-concept-gap",
      severity: "info",
      message:
        "Knowledge entries exist, but the concept graph is still empty or unlinked.",
    });
  }

  if (freshness?.status === "stale") {
    stalenessSignals.push({
      id: "knowledge-stale",
      severity: "warning",
      message: "All current knowledge entries are older than the configured freshness window.",
    });
  } else if (freshness?.status === "aging") {
    stalenessSignals.push({
      id: "knowledge-aging",
      severity: "info",
      message:
        "The knowledge base contains a mix of fresh and stale entries and needs refresh attention.",
    });
  }

  if (
    state.lastDriftRepairAt &&
    freshness?.latestEntryUpdatedAt &&
    Date.parse(state.lastDriftRepairAt) >
      Date.parse(freshness.latestEntryUpdatedAt)
  ) {
    stalenessSignals.push({
      id: "knowledge-behind-drift-repair",
      severity: "warning",
      message:
        "A newer drift repair completed after the latest knowledge entry update.",
    });
  }

  return {
    index: {
      indexedDocs: state.indexedDocs,
      docIndexVersion: state.docIndexVersion,
      docsConfigured: Boolean(config.docsPath),
      cookbookConfigured: Boolean(config.cookbookPath),
    },
    coverage: {
      entryCount: totalEntries,
      indexedDocCount: state.indexedDocs,
      entryToDocRatio:
        state.indexedDocs > 0
          ? Number((totalEntries / state.indexedDocs).toFixed(4))
          : null,
    },
    freshness: {
      status: freshness?.status ?? "empty",
      lastUpdated: summary?.lastUpdated ?? null,
      latestEntryUpdatedAt: freshness?.latestEntryUpdatedAt ?? null,
      lastDriftRepairAt: state.lastDriftRepairAt ?? null,
      stateUpdatedAt: state.updatedAt ?? null,
      staleAfterHours: freshness?.staleAfterHours ?? null,
    },
    signals: {
      coverage: coverageSignals,
      staleness: stalenessSignals,
      contradictions: contradictionSignals,
    },
  };
}

function buildClaimedTruthLayer(
  config: Awaited<ReturnType<typeof loadConfig>>,
  declaredAgents: number,
): ClaimedTruthLayer {
  const approvalGatedTaskTypes = Array.from(
    new Set(
      (config.approvalRequiredTaskTypes ?? ["agent-deploy", "build-refactor"]).map(
        (taskType) => String(taskType),
      ),
    ),
  ).sort();

  return {
    status: "declared",
    summary: `${declaredAgents} declared agents, ${ALLOWED_TASK_TYPES.length} allowlisted task types, separate public proof boundary via openclawdbot.`,
    controlPlane: "orchestrator",
    privateOperatorSurface: "/operator",
    authoritativeHealthRoute: "/api/health/extended",
    aggregateOverviewRoute: "/api/dashboard/overview",
    publicProofBoundary: "openclawdbot",
    declaredAgents,
    allowlistedTaskTypes: ALLOWED_TASK_TYPES.length,
    approvalGatedTaskTypes,
    evidence: [
      {
        id: "claimed-control-plane",
        label: "Control Plane",
        status: "declared",
        detail: "Orchestrator owns private operator APIs, queueing, approvals, and runtime state.",
        route: "/operator",
        value: "orchestrator",
      },
      {
        id: "claimed-health-route",
        label: "Authoritative Health Route",
        status: "declared",
        detail: "Extended health is the protected runtime truth surface.",
        route: "/api/health/extended",
      },
      {
        id: "claimed-overview-route",
        label: "Aggregate Overview Route",
        status: "declared",
        detail: "Dashboard overview is an operator aggregation, not stronger than its source routes.",
        route: "/api/dashboard/overview",
      },
      {
        id: "claimed-agent-catalog",
        label: "Declared Agents",
        status: "declared",
        detail: "Agent catalog discovered from manifests and runtime registry.",
        value: declaredAgents,
      },
      {
        id: "claimed-proof-boundary",
        label: "Public Proof Boundary",
        status: "declared",
        detail: "Public proof is intentionally split into the openclawdbot surface.",
        value: "openclawdbot",
      },
    ],
    signals:
      approvalGatedTaskTypes.length > 0
        ? [
            {
              id: "claimed-approval-policy",
              severity: "info",
              message: `${approvalGatedTaskTypes.length} task type(s) are approval-gated by declared policy.`,
              relatedRoutes: ["/api/approvals/pending"],
            },
          ]
        : [],
  };
}

function deriveProofTransportStatus({
  configured,
  ready,
  ledger,
}: {
  configured: boolean;
  ready: boolean;
  ledger: ReturnType<typeof summarizeDeliveryRecords>;
}): ProofTransportStatus {
  if (!configured) return "not-configured";
  if (!ready) return "misconfigured";
  if (ledger.deadLetterCount > 0 || ledger.rejectedCount > 0) return "degraded";
  if (ledger.pendingCount > 0 || ledger.retryingCount > 0) return "catching-up";
  if (ledger.deliveredCount > 0 || ledger.duplicateCount > 0) return "publishing";
  return "idle";
}

function rankProofTransportStatus(status: ProofTransportStatus) {
  switch (status) {
    case "degraded":
      return 5;
    case "misconfigured":
      return 4;
    case "catching-up":
      return 3;
    case "publishing":
      return 2;
    case "idle":
      return 1;
    case "not-configured":
    default:
      return 0;
  }
}

function buildProofDeliveryTelemetry(
  config: Awaited<ReturnType<typeof loadConfig>>,
  state: OrchestratorState,
): ProofDeliveryTelemetry {
  const signingSecretConfigured = Boolean(
    process.env.MILESTONE_SIGNING_SECRET?.trim(),
  );
  const milestoneLedger = summarizeDeliveryRecords(state.milestoneDeliveries);
  const demandSummaryLedger = summarizeDeliveryRecords(state.demandSummaryDeliveries);

  const latestMilestoneRecord =
    [...state.milestoneDeliveries].sort((left, right) =>
      left.sentAtUtc.localeCompare(right.sentAtUtc),
    ).at(-1) ?? null;
  const latestDemandSummaryRecord =
    [...state.demandSummaryDeliveries].sort((left, right) =>
      left.sentAtUtc.localeCompare(right.sentAtUtc),
    ).at(-1) ?? null;

  const milestoneStatus = deriveProofTransportStatus({
    configured: Boolean(config.milestoneIngestUrl),
    ready: Boolean(config.milestoneIngestUrl) && signingSecretConfigured,
    ledger: milestoneLedger,
  });
  const demandSummaryStatus = deriveProofTransportStatus({
    configured: Boolean(config.demandSummaryIngestUrl),
    ready: Boolean(config.demandSummaryIngestUrl) && signingSecretConfigured,
    ledger: demandSummaryLedger,
  });

  return {
    boundary: {
      surface: "openclawdbot",
      model: "separate-public-proof-surface",
    },
    signingSecretConfigured,
    milestone: {
      latestMilestoneId: latestMilestoneRecord?.milestoneId ?? null,
      deliveryStatus: milestoneStatus,
      targetConfigured: Boolean(config.milestoneIngestUrl),
      targetReady: Boolean(config.milestoneIngestUrl) && signingSecretConfigured,
      targetUrl: config.milestoneIngestUrl ?? null,
      feedConfigured: Boolean(config.milestoneFeedPath),
      feedReady: Boolean(config.milestoneFeedPath) && signingSecretConfigured,
      feedPath: config.milestoneFeedPath ?? null,
      gitPushEnabled: config.gitPushOnMilestone === true,
      ledger: milestoneLedger,
      lastDeliveredAt:
        state.lastMilestoneDeliveryAt ?? milestoneLedger.lastDeliveredAt,
    },
    demandSummary: {
      latestSummaryId: latestDemandSummaryRecord?.summaryId ?? null,
      deliveryStatus: demandSummaryStatus,
      targetConfigured: Boolean(config.demandSummaryIngestUrl),
      targetReady:
        Boolean(config.demandSummaryIngestUrl) && signingSecretConfigured,
      targetUrl: config.demandSummaryIngestUrl ?? null,
      ledger: demandSummaryLedger,
      lastDeliveredAt:
        state.lastDemandSummaryDeliveryAt ?? demandSummaryLedger.lastDeliveredAt,
    },
    overallStatus:
      rankProofTransportStatus(milestoneStatus) >=
      rankProofTransportStatus(demandSummaryStatus)
        ? milestoneStatus
        : demandSummaryStatus,
  };
}

function buildRuntimeTruthLayers({
  claimed,
  config,
  state,
  fastStartMode,
  persistenceStatus,
  knowledgeRuntime,
  queueQueued,
  queueProcessing,
  pendingApprovalsCount,
  repairs,
  retryRecoveries,
  agents,
  proofDelivery,
}: {
  claimed: ClaimedTruthLayer;
  config: Awaited<ReturnType<typeof loadConfig>>;
  state: OrchestratorState;
  fastStartMode: boolean;
  persistenceStatus: string;
  knowledgeRuntime: ReturnType<typeof buildKnowledgeRuntimeSignals>;
  queueQueued: number;
  queueProcessing: number;
  pendingApprovalsCount: number;
  repairs: {
    activeCount: number;
    verifiedCount: number;
    failedCount: number;
    lastDetectedAt: string | null;
  };
  retryRecoveries: {
    count: number;
    nextRetryAt: string | null;
  };
  agents: Awaited<ReturnType<typeof buildAgentOperationalOverview>>;
  proofDelivery: ProofDeliveryTelemetry;
}): RuntimeTruthLayers {
  const signingSecretConfigured = Boolean(
    process.env.MILESTONE_SIGNING_SECRET?.trim(),
  );
  const proofTransportsConfigured =
    Number(Boolean(config.milestoneIngestUrl)) +
    Number(Boolean(config.milestoneFeedPath)) +
    Number(Boolean(config.demandSummaryIngestUrl));

  const configuredStatus =
    proofTransportsConfigured === 0
      ? "local-only"
      : signingSecretConfigured
        ? "configured"
        : "partial";

  const lastTaskHandledAt =
    [...state.taskHistory]
      .map((task) => task.handledAt)
      .filter((handledAt) => Number.isFinite(Date.parse(handledAt)))
      .sort()
      .at(-1) ?? null;

  const observedStatus =
    persistenceStatus !== "healthy" ||
    repairs.failedCount > 0 ||
    proofDelivery.milestone.ledger.deadLetterCount > 0 ||
    proofDelivery.demandSummary.ledger.deadLetterCount > 0
      ? "degraded"
      : fastStartMode ||
          queueProcessing > 0 ||
          queueQueued > 0 ||
          pendingApprovalsCount > 0 ||
          retryRecoveries.count > 0 ||
          repairs.activeCount > 0 ||
          proofDelivery.milestone.ledger.retryingCount > 0 ||
          proofDelivery.demandSummary.ledger.retryingCount > 0
        ? "warning"
        : "stable";

  const serviceAvailableCount = agents.filter((agent) => agent.serviceAvailable).length;
  const serviceInstalledCount = agents.filter(
    (agent) => agent.serviceInstalled === true,
  ).length;
  const serviceRunningCount = agents.filter(
    (agent) => agent.serviceRunning === true,
  ).length;
  const knowledgeIndexedEntries = Number(knowledgeRuntime.coverage.entryCount ?? 0);

  const configuredSignals: TruthSignal[] = [];
  if (configuredStatus === "local-only") {
    configuredSignals.push({
      id: "configured-local-only",
      severity: "warning",
      message: "Proof transport targets are not configured, so this runtime is operating as local-only.",
      relatedRoutes: ["/api/dashboard/overview", "/api/health/extended"],
    });
  }
  if (!signingSecretConfigured) {
    configuredSignals.push({
      id: "configured-missing-signing-secret",
      severity: "critical",
      message: "MILESTONE_SIGNING_SECRET is not configured; signed proof delivery cannot be trusted end-to-end.",
      relatedRoutes: ["/api/dashboard/overview", "/api/health/extended"],
    });
  }
  if (!config.docsPath) {
    configuredSignals.push({
      id: "configured-docs-missing",
      severity: "warning",
      message: "docsPath is not configured; repository knowledge intake is reduced.",
    });
  }
  if (!config.stateFile) {
    configuredSignals.push({
      id: "configured-state-file-missing",
      severity: "critical",
      message: "stateFile is not configured; durable orchestrator state is undefined.",
    });
  }

  const observedSignals: TruthSignal[] = [];
  if (persistenceStatus !== "healthy") {
    observedSignals.push({
      id: "observed-persistence-degraded",
      severity: "critical",
      message: `Persistence is currently ${persistenceStatus}.`,
      relatedRoutes: ["/api/persistence/health", "/api/health/extended"],
    });
  }
  if (queueQueued > 0 || queueProcessing > 0) {
    observedSignals.push({
      id: "observed-queue-pressure",
      severity: queueQueued > 10 ? "warning" : "info",
      message: `${queueQueued} queued and ${queueProcessing} processing tasks are currently in flight.`,
      relatedRoutes: ["/api/tasks/runs"],
    });
  }
  if (pendingApprovalsCount > 0) {
    observedSignals.push({
      id: "observed-approval-backlog",
      severity: pendingApprovalsCount > 3 ? "warning" : "info",
      message: `${pendingApprovalsCount} approval-gated task(s) are waiting on operator review.`,
      relatedRoutes: ["/api/approvals/pending"],
    });
  }
  if (repairs.failedCount > 0 || repairs.activeCount > 0) {
    observedSignals.push({
      id: "observed-repairs-active",
      severity: repairs.failedCount > 0 ? "critical" : "warning",
      message:
        repairs.failedCount > 0
          ? `${repairs.failedCount} repair flow(s) have failed verification.`
          : `${repairs.activeCount} repair flow(s) are actively running.`,
      relatedRoutes: ["/api/dashboard/overview", "/api/health/extended"],
    });
  }
  if (retryRecoveries.count > 0) {
    observedSignals.push({
      id: "observed-retry-recovery",
      severity: "warning",
      message: `${retryRecoveries.count} persisted retry recovery task(s) are awaiting replay.`,
      relatedRoutes: ["/api/tasks/runs"],
    });
  }
  if (serviceAvailableCount > serviceRunningCount) {
    observedSignals.push({
      id: "observed-service-gaps",
      severity: "warning",
      message: `${serviceRunningCount}/${serviceAvailableCount} agent service entrypoints are currently running.`,
      relatedRoutes: ["/api/agents/overview"],
    });
  }
  if ((knowledgeRuntime.signals.staleness?.length ?? 0) > 0) {
    observedSignals.push({
      id: "observed-knowledge-staleness",
      severity: "warning",
      message: `${knowledgeRuntime.signals.staleness.length} knowledge freshness signal(s) are active.`,
      relatedRoutes: ["/api/knowledge/summary"],
    });
  }
  if ((knowledgeRuntime.signals.contradictions?.length ?? 0) > 0) {
    observedSignals.push({
      id: "observed-knowledge-contradictions",
      severity: "warning",
      message: `${knowledgeRuntime.signals.contradictions.length} knowledge contradiction signal(s) were detected.`,
      relatedRoutes: ["/api/knowledge/summary"],
    });
  }

  const publicSignals: TruthSignal[] = [];
  if (proofDelivery.overallStatus === "not-configured") {
    publicSignals.push({
      id: "public-proof-unconfigured",
      severity: "warning",
      message: "No proof transport targets are configured for the public proof boundary.",
      relatedRoutes: ["/api/dashboard/overview", "/api/health/extended"],
    });
  }
  if (
    proofDelivery.milestone.deliveryStatus === "degraded" ||
    proofDelivery.demandSummary.deliveryStatus === "degraded"
  ) {
    publicSignals.push({
      id: "public-proof-degraded",
      severity: "critical",
      message: "Public proof delivery has dead-letter or rejected records.",
      relatedRoutes: ["/api/dashboard/overview", "/api/health/extended"],
    });
  }
  if (
    proofDelivery.milestone.deliveryStatus === "catching-up" ||
    proofDelivery.demandSummary.deliveryStatus === "catching-up"
  ) {
    publicSignals.push({
      id: "public-proof-catching-up",
      severity: "warning",
      message: "Public proof delivery is retrying or catching up on queued records.",
      relatedRoutes: ["/api/dashboard/overview", "/api/health/extended"],
    });
  }

  return {
    claimed,
    configured: {
      status: configuredStatus,
      summary:
        configuredStatus === "local-only"
          ? "Control plane is configured locally, but public proof transport targets are not wired."
          : configuredStatus === "partial"
            ? "Some proof transport prerequisites are configured, but signing or transport readiness is incomplete."
            : "Runtime configuration is present for control-plane and proof transport surfaces.",
      fastStartMode,
      docsConfigured: Boolean(config.docsPath),
      cookbookConfigured: Boolean(config.cookbookPath),
      stateFileConfigured: Boolean(config.stateFile),
      milestoneIngestConfigured: Boolean(config.milestoneIngestUrl),
      milestoneFeedConfigured: Boolean(config.milestoneFeedPath),
      demandSummaryIngestConfigured: Boolean(config.demandSummaryIngestUrl),
      signingSecretConfigured,
      proofTransportsConfigured,
      evidence: [
        {
          id: "configured-docs-path",
          label: "Docs Root",
          status: config.docsPath ? "configured" : "missing",
          detail: config.docsPath
            ? "Primary repository docs root is configured."
            : "Primary docs root is not configured.",
          value: config.docsPath ?? null,
        },
        {
          id: "configured-cookbook-path",
          label: "Cookbook Root",
          status: config.cookbookPath ? "configured" : "optional",
          detail: config.cookbookPath
            ? "Cookbook clue root is configured."
            : "Cookbook clue root is not configured.",
          value: config.cookbookPath ?? null,
        },
        {
          id: "configured-state-file",
          label: "State File",
          status: config.stateFile ? "configured" : "missing",
          detail: config.stateFile
            ? "Durable orchestrator state file is configured."
            : "No durable state file is configured.",
          value: config.stateFile ?? null,
        },
        {
          id: "configured-proof-targets",
          label: "Proof Targets",
          status: configuredStatus,
          detail: `${proofTransportsConfigured} proof transport path(s) are configured.`,
          value: proofTransportsConfigured,
        },
        {
          id: "configured-signing-secret",
          label: "Proof Signing Secret",
          status: signingSecretConfigured ? "configured" : "missing",
          detail: signingSecretConfigured
            ? "Signed proof delivery secret is configured."
            : "Signed proof delivery secret is missing.",
          value: signingSecretConfigured,
        },
      ],
      signals: configuredSignals,
    },
    observed: {
      status: observedStatus,
      summary:
        observedStatus === "degraded"
          ? "Runtime evidence shows degraded persistence, repairs, or proof delivery."
          : observedStatus === "warning"
            ? "Runtime evidence shows queue, approval, retry, or freshness pressure."
            : "Runtime evidence is stable across queue, approvals, services, and proof delivery.",
      queue: {
        queued: queueQueued,
        processing: queueProcessing,
      },
      approvals: {
        pendingCount: pendingApprovalsCount,
      },
      repairs,
      retryRecoveries,
      recentTasks: {
        count: state.taskHistory.slice(-20).length,
        lastHandledAt: lastTaskHandledAt,
      },
      persistenceStatus,
      knowledgeIndexedEntries,
      lastMilestoneDeliveryAt: state.lastMilestoneDeliveryAt ?? null,
      lastDemandSummaryDeliveryAt: state.lastDemandSummaryDeliveryAt ?? null,
      evidence: [
        {
          id: "observed-queue",
          label: "Queue Runtime",
          status: queueQueued > 0 || queueProcessing > 0 ? "active" : "idle",
          detail: `${queueQueued} queued, ${queueProcessing} processing.`,
        },
        {
          id: "observed-approvals",
          label: "Approval Runtime",
          status: pendingApprovalsCount > 0 ? "waiting" : "clear",
          detail: `${pendingApprovalsCount} approval-gated task(s) are pending.`,
        },
        {
          id: "observed-repairs",
          label: "Repair Runtime",
          status:
            repairs.failedCount > 0
              ? "degraded"
              : repairs.activeCount > 0
                ? "active"
                : "stable",
          detail: `${repairs.activeCount} active, ${repairs.verifiedCount} verified, ${repairs.failedCount} failed.`,
        },
        {
          id: "observed-services",
          label: "Agent Services",
          status:
            serviceAvailableCount > serviceRunningCount ? "warning" : "stable",
          detail: `${serviceRunningCount}/${serviceAvailableCount} running, ${serviceInstalledCount} installed.`,
        },
        {
          id: "observed-knowledge",
          label: "Knowledge Runtime",
          status: String(knowledgeRuntime.freshness.status ?? "empty"),
          detail: `${knowledgeIndexedEntries} entries, ${knowledgeRuntime.signals.contradictions.length} contradiction signal(s).`,
        },
      ],
      signals: observedSignals,
    },
    public: {
      status: proofDelivery.overallStatus,
      summary:
        proofDelivery.overallStatus === "publishing"
          ? "Public proof delivery is publishing signed runtime evidence."
          : proofDelivery.overallStatus === "catching-up"
            ? "Public proof delivery is configured but still catching up."
            : proofDelivery.overallStatus === "degraded"
              ? "Public proof delivery is degraded and has dead-letter or rejected records."
              : proofDelivery.overallStatus === "misconfigured"
                ? "Public proof delivery is partially configured but not ready."
                : "Public proof transport is idle or not configured.",
      boundary: "openclawdbot",
      milestoneStatus: proofDelivery.milestone.deliveryStatus,
      demandSummaryStatus: proofDelivery.demandSummary.deliveryStatus,
      lastMilestoneDeliveryAt: proofDelivery.milestone.lastDeliveredAt,
      lastDemandSummaryDeliveryAt: proofDelivery.demandSummary.lastDeliveredAt,
      deadLetterCount:
        proofDelivery.milestone.ledger.deadLetterCount +
        proofDelivery.demandSummary.ledger.deadLetterCount,
      evidence: [
        {
          id: "public-milestones",
          label: "Milestone Delivery",
          status: proofDelivery.milestone.deliveryStatus,
          detail: `${proofDelivery.milestone.ledger.deliveredCount} delivered, ${proofDelivery.milestone.ledger.deadLetterCount} dead-letter.`,
          value: proofDelivery.milestone.targetUrl ?? proofDelivery.milestone.feedPath ?? null,
        },
        {
          id: "public-demand-summaries",
          label: "Demand Summary Delivery",
          status: proofDelivery.demandSummary.deliveryStatus,
          detail: `${proofDelivery.demandSummary.ledger.deliveredCount} delivered, ${proofDelivery.demandSummary.ledger.deadLetterCount} dead-letter.`,
          value: proofDelivery.demandSummary.targetUrl ?? null,
        },
        {
          id: "public-signing",
          label: "Signing Readiness",
          status: proofDelivery.signingSecretConfigured ? "configured" : "missing",
          detail: proofDelivery.signingSecretConfigured
            ? "Signed proof boundary secret is configured."
            : "Signed proof boundary secret is missing.",
          value: proofDelivery.signingSecretConfigured,
        },
      ],
      signals: publicSignals,
    },
  };
}

async function buildAgentTopology({
  agents,
  proofDelivery,
}: {
  agents: Awaited<ReturnType<typeof buildAgentOperationalOverview>>;
  proofDelivery: ProofDeliveryTelemetry;
}): Promise<AgentTopology> {
  const registry = await getAgentRegistry();
  const nodes = new Map<string, AgentTopologyNode>();
  const edges = new Map<string, AgentTopologyEdge>();

  const addNode = (node: AgentTopologyNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };

  const addEdge = (edge: AgentTopologyEdge) => {
    if (!edges.has(edge.id)) edges.set(edge.id, edge);
  };

  const proofNodeStatus: TopologyNodeStatus =
    proofDelivery.overallStatus === "degraded" ||
    proofDelivery.overallStatus === "misconfigured"
      ? "degraded"
      : proofDelivery.overallStatus === "catching-up" ||
          proofDelivery.overallStatus === "idle" ||
          proofDelivery.overallStatus === "not-configured"
        ? "warning"
        : "live";

  addNode({
    id: "surface:orchestrator",
    kind: "control-plane",
    label: "orchestrator",
    status: "live",
    detail:
      "Private control plane for queueing, approvals, runtime truth, and task dispatch.",
    route: "/api/dashboard/overview",
  });

  addNode({
    id: "surface:openclawdbot",
    kind: "surface",
    label: "openclawdbot",
    status: proofNodeStatus,
    detail:
      "Separate public proof boundary that receives signed milestones and demand summaries.",
    route: "/api/command-center/overview",
  });

  const taskProfileByType = new Map(
    OPERATOR_TASK_PROFILES.map((profile) => [profile.type, profile]),
  );

  for (const agent of agents) {
    const agentStatus: TopologyNodeStatus =
      agent.serviceAvailable &&
      (agent.serviceInstalled === false || agent.serviceRunning === false)
        ? "warning"
        : agent.workerValidationStatus === "not-yet-verified" ||
            agent.workerValidationStatus === "partial-worker"
          ? "warning"
          : agent.spawnedWorkerCapable || agent.serviceAvailable
            ? "live"
            : "degraded";

    addNode({
      id: `agent:${agent.id}`,
      kind: "agent",
      label: agent.name,
      status: agentStatus,
      detail:
        agent.description ??
        agent.notes?.[0] ??
        "Registered agent runtime surface.",
      route: "/api/agents/overview",
    });

    const allowedSkills = registry.getAllowedSkills(agent.id);
    for (const skillId of allowedSkills) {
      addNode({
        id: `skill:${skillId}`,
        kind: "skill",
        label: skillId,
        status: agentStatus === "degraded" ? "warning" : "declared",
        detail: "Skill permission declared in the agent manifest.",
      });

      addEdge({
        id: `edge:agent:${agent.id}:skill:${skillId}`,
        from: `agent:${agent.id}`,
        to: `skill:${skillId}`,
        relationship: "uses-skill",
        status: agentStatus === "degraded" ? "warning" : "declared",
        detail: `${agent.name} is permitted to invoke ${skillId}.`,
        evidence: [`manifest skill permission: ${skillId}`],
      });
    }

    if (agent.orchestratorTask) {
      const profile = taskProfileByType.get(agent.orchestratorTask) ?? null;
      addNode({
        id: `task:${agent.orchestratorTask}`,
        kind: "task",
        label: profile?.label ?? agent.orchestratorTask,
        status: agentStatus === "degraded" ? "warning" : "declared",
        detail: profile?.purpose ?? "Manifest-routed runtime task.",
        route: "/api/tasks/catalog",
      });

      addEdge({
        id: `edge:orchestrator:task:${agent.orchestratorTask}`,
        from: "surface:orchestrator",
        to: `task:${agent.orchestratorTask}`,
        relationship: "dispatches-task",
        status: "declared",
        detail: `Orchestrator accepts ${agent.orchestratorTask} into the runtime queue.`,
        evidence: [`allowlisted task: ${agent.orchestratorTask}`],
      });

      addEdge({
        id: `edge:task:${agent.orchestratorTask}:agent:${agent.id}`,
        from: `task:${agent.orchestratorTask}`,
        to: `agent:${agent.id}`,
        relationship: "routes-to-agent",
        status: agentStatus === "degraded" ? "warning" : "live",
        detail: `${agent.orchestratorTask} routes to ${agent.name}.`,
        evidence: [`agent manifest orchestratorTask: ${agent.orchestratorTask}`],
      });
    }
  }

  for (const [taskType, requirement] of Object.entries(TASK_AGENT_SKILL_REQUIREMENTS)) {
    const agent = agents.find((item) => item.id === requirement.agentId) ?? null;
    const agentName = agent?.name ?? requirement.agentId;
    const taskProfile = taskProfileByType.get(taskType) ?? null;
    const taskNodeId = `task:${taskType}`;
    const agentNodeId = `agent:${requirement.agentId}`;
    const skillNodeId = `skill:${requirement.skillId}`;

    addNode({
      id: taskNodeId,
      kind: "task",
      label: taskProfile?.label ?? taskType,
      status: agent ? "declared" : "warning",
      detail: taskProfile?.purpose ?? "Runtime task with explicit agent/skill requirement.",
      route: "/api/tasks/catalog",
    });
    addNode({
      id: skillNodeId,
      kind: "skill",
      label: requirement.skillId,
      status: agent ? "declared" : "warning",
      detail: "Skill required by a routed task contract.",
    });

    addEdge({
      id: `edge:orchestrator:task:${taskType}`,
      from: "surface:orchestrator",
      to: taskNodeId,
      relationship: "dispatches-task",
      status: "declared",
      detail: `Orchestrator can dispatch ${taskType}.`,
      evidence: [`task requirement: ${taskType}`],
    });
    addEdge({
      id: `edge:task:${taskType}:agent:${requirement.agentId}`,
      from: taskNodeId,
      to: agentNodeId,
      relationship: "routes-to-agent",
      status: agent ? "live" : "warning",
      detail: `${taskType} routes to ${agentName}.`,
      evidence: [`task requirement agent: ${requirement.agentId}`],
    });
    addEdge({
      id: `edge:agent:${requirement.agentId}:skill:${requirement.skillId}`,
      from: agentNodeId,
      to: skillNodeId,
      relationship: "uses-skill",
      status: agent ? "declared" : "warning",
      detail: `${agentName} uses ${requirement.skillId} for ${taskType}.`,
      evidence: [`task requirement skill: ${requirement.skillId}`],
    });
  }

  if (
    proofDelivery.milestone.targetConfigured ||
    proofDelivery.milestone.feedConfigured ||
    proofDelivery.demandSummary.targetConfigured
  ) {
    addEdge({
      id: "edge:orchestrator:openclawdbot",
      from: "surface:orchestrator",
      to: "surface:openclawdbot",
      relationship: "publishes-proof",
      status:
        proofNodeStatus === "degraded"
          ? "degraded"
          : proofNodeStatus === "warning"
            ? "warning"
            : "live",
      detail:
        "Orchestrator publishes signed milestones and demand summaries across the public proof boundary.",
      evidence: [
        proofDelivery.milestone.targetUrl
          ? `milestone target: ${proofDelivery.milestone.targetUrl}`
          : "milestone target not configured",
        proofDelivery.demandSummary.targetUrl
          ? `demand target: ${proofDelivery.demandSummary.targetUrl}`
          : "demand target not configured",
      ],
    });
  }

  const nodeList = Array.from(nodes.values());
  const edgeList = Array.from(edges.values());
  const hotspots: string[] = [];
  const serviceGapCount = agents.filter(
    (agent) =>
      agent.serviceAvailable &&
      (agent.serviceInstalled === false || agent.serviceRunning === false),
  ).length;

  if (serviceGapCount > 0) {
    hotspots.push(`${serviceGapCount} agent service path(s) are declared but not fully running.`);
  }
  if (proofNodeStatus === "degraded") {
    hotspots.push("Public proof transport is degraded.");
  } else if (proofNodeStatus === "warning") {
    hotspots.push("Public proof transport is configured but not yet fully steady.");
  }
  if (
    agents.some(
      (agent) =>
        agent.workerValidationStatus === "partial-worker" ||
        agent.workerValidationStatus === "not-yet-verified",
    )
  ) {
    hotspots.push("One or more worker paths remain partial or not yet verified.");
  }

  const status =
    proofNodeStatus === "degraded"
      ? "degraded"
      : hotspots.length > 0
        ? "warning"
        : "stable";

  return {
    generatedAt: new Date().toISOString(),
    status,
    counts: {
      controlPlaneNodes: nodeList.filter((node) => node.kind === "control-plane").length,
      taskNodes: nodeList.filter((node) => node.kind === "task").length,
      agentNodes: nodeList.filter((node) => node.kind === "agent").length,
      skillNodes: nodeList.filter((node) => node.kind === "skill").length,
      surfaceNodes: nodeList.filter((node) => node.kind === "surface").length,
      totalNodes: nodeList.length,
      dispatchEdges: edgeList.filter((edge) => edge.relationship === "dispatches-task").length,
      routeEdges: edgeList.filter((edge) => edge.relationship === "routes-to-agent").length,
      skillEdges: edgeList.filter((edge) => edge.relationship === "uses-skill").length,
      proofEdges: edgeList.filter((edge) => edge.relationship === "publishes-proof").length,
      totalEdges: edgeList.length,
    },
    hotspots,
    nodes: nodeList,
    edges: edgeList,
  };
}

type IncidentCandidate = {
  fingerprint: string;
  title: string;
  classification: IncidentLedgerClassification;
  severity: IncidentLedgerSeverity;
  status: Extract<IncidentLedgerStatus, "active" | "watching">;
  truthLayer: IncidentLedgerTruthLayer;
  summary: string;
  detectedAt: string | null;
  affectedSurfaces: string[];
  linkedServiceIds: string[];
  linkedTaskIds: string[];
  linkedRunIds: string[];
  linkedRepairIds: string[];
  linkedProofDeliveries: string[];
  evidence: string[];
  recommendedSteps: string[];
  remediation: {
    owner: IncidentRemediationOwner;
    status: Exclude<IncidentRemediationStatus, "resolved">;
    summary: string;
    nextAction: string;
    blockers: string[];
  };
};

function buildIncidentFingerprint(
  classification: IncidentLedgerClassification,
  scope: string,
) {
  const digest = createHash("sha1").update(`${classification}:${scope}`).digest("hex");
  return `incident:${classification}:${digest.slice(0, 14)}`;
}

function dedupeStrings(values: Array<string | null | undefined>, limit: number = 12) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))].slice(0, limit);
}

function recordsEqual(left: IncidentLedgerRecord, right: IncidentLedgerRecord) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function acknowledgeIncidentRecord(
  state: OrchestratorState,
  incidentId: string,
  actor: string,
  note?: string,
) {
  const target = state.incidentLedger.find((record) => record.incidentId === incidentId);
  if (!target) {
    throw new Error(`Incident not found: ${incidentId}`);
  }

  target.acknowledgedAt = new Date().toISOString();
  target.acknowledgedBy = actor;
  target.acknowledgementNote = note ?? null;
  return target;
}

function assignIncidentOwner(
  state: OrchestratorState,
  incidentId: string,
  owner: string,
) {
  const target = state.incidentLedger.find((record) => record.incidentId === incidentId);
  if (!target) {
    throw new Error(`Incident not found: ${incidentId}`);
  }

  target.owner = owner;
  return target;
}

function reconcileRuntimeIncidentLedger(
  state: OrchestratorState,
  candidates: IncidentCandidate[],
): { changed: boolean; model: RuntimeIncidentModel } {
  const now = new Date().toISOString();
  const ledgerByFingerprint = new Map(
    state.incidentLedger.map((record) => [record.fingerprint, record]),
  );
  const seenFingerprints = new Set<string>();
  let changed = false;

  for (const candidate of candidates) {
    seenFingerprints.add(candidate.fingerprint);
    const detectedAt = candidate.detectedAt ?? now;
    const existing = ledgerByFingerprint.get(candidate.fingerprint);

    if (!existing) {
      state.incidentLedger.push({
        incidentId: randomUUID(),
        fingerprint: candidate.fingerprint,
        title: candidate.title,
        classification: candidate.classification,
        severity: candidate.severity,
        truthLayer: candidate.truthLayer,
        firstSeenAt: detectedAt,
        lastSeenAt: detectedAt,
        resolvedAt: null,
        status: candidate.status,
        acknowledgedAt: null,
        acknowledgedBy: null,
        acknowledgementNote: null,
        owner: null,
        summary: candidate.summary,
        affectedSurfaces: dedupeStrings(candidate.affectedSurfaces),
        linkedServiceIds: dedupeStrings(candidate.linkedServiceIds),
        linkedTaskIds: dedupeStrings(candidate.linkedTaskIds),
        linkedRunIds: dedupeStrings(candidate.linkedRunIds),
        linkedRepairIds: dedupeStrings(candidate.linkedRepairIds),
        linkedProofDeliveries: dedupeStrings(candidate.linkedProofDeliveries),
        evidence: dedupeStrings(candidate.evidence),
        recommendedSteps: dedupeStrings(candidate.recommendedSteps),
        remediation: {
          owner: candidate.remediation.owner,
          status: candidate.remediation.status,
          summary: candidate.remediation.summary,
          nextAction: candidate.remediation.nextAction,
          blockers: dedupeStrings(candidate.remediation.blockers),
        },
      });
      changed = true;
      continue;
    }

    const updated: IncidentLedgerRecord = {
      ...existing,
      title: candidate.title,
      classification: candidate.classification,
      severity: candidate.severity,
      truthLayer: candidate.truthLayer,
      lastSeenAt: detectedAt,
      resolvedAt: null,
      status: candidate.status,
      summary: candidate.summary,
      affectedSurfaces: dedupeStrings(candidate.affectedSurfaces),
      linkedServiceIds: dedupeStrings(candidate.linkedServiceIds),
      linkedTaskIds: dedupeStrings(candidate.linkedTaskIds),
      linkedRunIds: dedupeStrings(candidate.linkedRunIds),
      linkedRepairIds: dedupeStrings(candidate.linkedRepairIds),
      linkedProofDeliveries: dedupeStrings(candidate.linkedProofDeliveries),
      evidence: dedupeStrings(candidate.evidence),
      recommendedSteps: dedupeStrings(candidate.recommendedSteps),
      remediation: {
        owner: candidate.remediation.owner,
        status: candidate.remediation.status,
        summary: candidate.remediation.summary,
        nextAction: candidate.remediation.nextAction,
        blockers: dedupeStrings(candidate.remediation.blockers),
      },
    };

    if (!recordsEqual(existing, updated)) {
      Object.assign(existing, updated);
      changed = true;
    }
  }

  for (const record of state.incidentLedger) {
    if (seenFingerprints.has(record.fingerprint)) continue;
    if (record.status === "resolved") continue;
    record.status = "resolved";
    record.resolvedAt = now;
    record.remediation.status = "resolved";
    changed = true;
  }

  const openIncidents = [...state.incidentLedger]
    .filter((record) => record.status !== "resolved")
    .sort((left, right) => {
      const severityRank: Record<IncidentLedgerSeverity, number> = {
        critical: 3,
        warning: 2,
        info: 1,
      };
      const severityDiff = severityRank[right.severity] - severityRank[left.severity];
      if (severityDiff !== 0) return severityDiff;
      return Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt);
    });

  const bySeverity = {
    critical: openIncidents.filter((record) => record.severity === "critical").length,
    warning: openIncidents.filter((record) => record.severity === "warning").length,
    info: openIncidents.filter((record) => record.severity === "info").length,
  };

  return {
    changed,
    model: {
      generatedAt: now,
      overallStatus:
        bySeverity.critical > 0
          ? "critical"
          : bySeverity.warning > 0
            ? "warning"
            : "stable",
      openCount: openIncidents.length,
      activeCount: openIncidents.filter((record) => record.status === "active").length,
      watchingCount: openIncidents.filter((record) => record.status === "watching").length,
      bySeverity,
      incidents: openIncidents.map((record) => ({
        id: record.incidentId,
        fingerprint: record.fingerprint,
        title: record.title,
        classification: record.classification,
        severity: record.severity,
        status: record.status,
        truthLayer: record.truthLayer,
        summary: record.summary,
        firstSeenAt: record.firstSeenAt,
        lastSeenAt: record.lastSeenAt,
        resolvedAt: record.resolvedAt ?? null,
        detectedAt: record.lastSeenAt,
        acknowledgedAt: record.acknowledgedAt ?? null,
        acknowledgedBy: record.acknowledgedBy ?? null,
        acknowledgementNote: record.acknowledgementNote ?? null,
        owner: record.owner ?? null,
        affectedSurfaces: record.affectedSurfaces,
        linkedServiceIds: record.linkedServiceIds,
        linkedTaskIds: record.linkedTaskIds,
        linkedRunIds: record.linkedRunIds,
        linkedRepairIds: record.linkedRepairIds,
        linkedProofDeliveries: record.linkedProofDeliveries,
        evidence: record.evidence,
        recommendedSteps: record.recommendedSteps,
        remediation: {
          owner: record.remediation.owner,
          status: record.remediation.status,
          summary: record.remediation.summary,
          nextAction: record.remediation.nextAction,
          blockers: record.remediation.blockers,
        },
      })),
    },
  };
}

function buildRuntimeIncidentModel({
  config,
  state,
  fastStartMode,
  persistence,
  agents,
  governance,
  pendingApprovalsCount,
  proofDelivery,
  knowledgeRuntime,
}: {
  config: Awaited<ReturnType<typeof loadConfig>>;
  state: OrchestratorState;
  fastStartMode: boolean;
  persistence: Awaited<ReturnType<typeof PersistenceIntegration.healthCheck>>;
  agents: Awaited<ReturnType<typeof buildAgentOperationalOverview>>;
  governance: ReturnType<typeof summarizeGovernanceVisibility>;
  pendingApprovalsCount: number;
  proofDelivery: ProofDeliveryTelemetry;
  knowledgeRuntime: ReturnType<typeof buildKnowledgeRuntimeSignals>;
}): { changed: boolean; model: RuntimeIncidentModel } {
  const candidates: IncidentCandidate[] = [];

  const addIncident = (incident: IncidentCandidate) => {
    candidates.push(incident);
  };

  if (fastStartMode) {
    addIncident({
      fingerprint: buildIncidentFingerprint("runtime-mode", "fast-start"),
      title: "Fast-start mode active",
      classification: "runtime-mode",
      severity: "warning",
      status: "watching",
      truthLayer: "configured",
      summary:
        "The orchestrator is running in fast-start mode, so some deep integrations may be intentionally reduced.",
      detectedAt: state.lastStartedAt ?? state.updatedAt ?? null,
      affectedSurfaces: ["control-plane", "knowledge", "persistence"],
      linkedServiceIds: ["orchestrator.service"],
      linkedTaskIds: [],
      linkedRunIds: [],
      linkedRepairIds: [],
      linkedProofDeliveries: [],
      evidence: ["ORCHESTRATOR_FAST_START=true"],
      recommendedSteps: [
        "Restart the orchestrator without ORCHESTRATOR_FAST_START=true.",
      ],
      remediation: {
        owner: "operator",
        status: "ready",
        summary: "Exit fast-start mode to regain the full boot path.",
        nextAction: "Restart the orchestrator without ORCHESTRATOR_FAST_START=true.",
        blockers: [],
      },
    });
  }

  if (persistence.status !== "healthy") {
    addIncident({
      fingerprint: buildIncidentFingerprint("persistence", "primary"),
      title: "Persistence degraded",
      classification: "persistence",
      severity: "critical",
      status: "active",
      truthLayer: "observed",
      summary: `Persistence health is currently ${String(persistence.status)}.`,
      detectedAt: state.updatedAt ?? null,
      affectedSurfaces: ["persistence", "knowledge", "control-plane"],
      linkedServiceIds: ["mongodb", "orchestrator.service"],
      linkedTaskIds: [],
      linkedRunIds: [],
      linkedRepairIds: [],
      linkedProofDeliveries: [],
      evidence: [
        `persistence status: ${String(persistence.status)}`,
        `database connected: ${String((persistence as any).database ?? false)}`,
      ],
      recommendedSteps: [
        "Inspect /api/persistence/health for the precise failure mode.",
        "Verify database credentials and connectivity from the host.",
      ],
      remediation: {
        owner: "operator",
        status: "ready",
        summary: "Restore database connectivity and re-run health checks.",
        nextAction: "Inspect /api/persistence/health and backing database credentials or connectivity.",
        blockers: [],
      },
    });
  }

  const pushProofIncident = ({
    transport,
    title,
    deliveryStatus,
    ledger,
    targetConfigured,
    targetReady,
    detectedAt,
    targetUrl,
  }: {
    transport: "milestone" | "demandSummary";
    title: string;
    deliveryStatus: ProofTransportStatus;
    ledger: ReturnType<typeof summarizeDeliveryRecords>;
    targetConfigured: boolean;
    targetReady: boolean;
    detectedAt: string | null;
    targetUrl: string | null;
  }) => {
    if (deliveryStatus === "publishing" || deliveryStatus === "idle") return;

    const severity: IncidentLedgerSeverity =
      deliveryStatus === "degraded" || deliveryStatus === "misconfigured"
        ? "critical"
        : "warning";
    const status: Extract<IncidentLedgerStatus, "active" | "watching"> =
      deliveryStatus === "catching-up" ? "watching" : "active";
    const blockers: string[] = [];
    if (!targetConfigured) blockers.push("delivery target not configured");
    if (targetConfigured && !targetReady) blockers.push("signing secret or target readiness incomplete");

    addIncident({
      fingerprint: buildIncidentFingerprint("proof-delivery", transport),
      title,
      classification: "proof-delivery",
      severity,
      status,
      truthLayer: "public",
      summary:
        deliveryStatus === "not-configured"
          ? "Proof delivery target is not configured."
          : deliveryStatus === "misconfigured"
            ? "Proof delivery target exists but is not ready for signed delivery."
            : deliveryStatus === "catching-up"
              ? "Proof delivery is retrying or draining queued records."
              : "Proof delivery has dead-letter or rejected records.",
      detectedAt,
      affectedSurfaces: ["openclawdbot", "proof-pipeline"],
      linkedServiceIds: ["openclawdbot.service", "cloudflared-openclawdbot.service"],
      linkedTaskIds: [],
      linkedRunIds: [],
      linkedRepairIds: [],
      linkedProofDeliveries: [transport],
      evidence: [
        `delivery status: ${deliveryStatus}`,
        `target: ${targetUrl ?? "not configured"}`,
        `pending=${ledger.pendingCount}, retrying=${ledger.retryingCount}, deadLetter=${ledger.deadLetterCount}, delivered=${ledger.deliveredCount}`,
      ],
      recommendedSteps: blockers.length > 0
        ? ["Restore signing or target configuration for the proof transport."]
        : [
            "Inspect proof delivery ledger state.",
            "Replay or clear dead-letter proof records.",
          ],
      remediation: {
        owner: blockers.length > 0 ? "operator" : "mixed",
        status:
          blockers.length > 0
            ? "blocked"
            : deliveryStatus === "catching-up"
              ? "in-progress"
              : "ready",
        summary:
          blockers.length > 0
            ? "Configuration must be completed before delivery can recover."
            : "Delivery path is configured; operator attention is needed until the backlog or dead-letter state clears.",
        nextAction:
          blockers.length > 0
            ? "Restore signing or target configuration for the proof transport."
            : "Inspect proof delivery ledger and replay or clear dead-letter records.",
        blockers,
      },
    });
  };

  pushProofIncident({
    transport: "milestone",
    title: "Milestone proof delivery impaired",
    deliveryStatus: proofDelivery.milestone.deliveryStatus,
    ledger: proofDelivery.milestone.ledger,
    targetConfigured:
      proofDelivery.milestone.targetConfigured || proofDelivery.milestone.feedConfigured,
    targetReady:
      proofDelivery.milestone.targetReady || proofDelivery.milestone.feedReady,
    detectedAt:
      proofDelivery.milestone.ledger.lastAttemptAt ??
      proofDelivery.milestone.lastDeliveredAt,
    targetUrl:
      proofDelivery.milestone.targetUrl ?? proofDelivery.milestone.feedPath ?? null,
  });

  pushProofIncident({
    transport: "demandSummary",
    title: "Demand summary proof delivery impaired",
    deliveryStatus: proofDelivery.demandSummary.deliveryStatus,
    ledger: proofDelivery.demandSummary.ledger,
    targetConfigured: proofDelivery.demandSummary.targetConfigured,
    targetReady: proofDelivery.demandSummary.targetReady,
    detectedAt:
      proofDelivery.demandSummary.ledger.lastAttemptAt ??
      proofDelivery.demandSummary.lastDeliveredAt,
    targetUrl: proofDelivery.demandSummary.targetUrl,
  });

  const activeRepairRecords = state.repairRecords.filter((record) =>
    ["detected", "queued", "running", "failed"].includes(record.status),
  );
  for (const record of activeRepairRecords) {
    addIncident({
      fingerprint: buildIncidentFingerprint("repair", record.repairId),
      title: `Repair ${record.repairId} requires attention`,
      classification: "repair",
      severity: record.status === "failed" ? "critical" : "warning",
      status: record.status === "failed" ? "active" : "watching",
      truthLayer: "observed",
      summary:
        record.status === "failed"
          ? `Repair ${record.repairId} failed verification.`
          : `Repair ${record.repairId} is ${record.status}.`,
      detectedAt:
        record.completedAt ??
        record.startedAt ??
        record.queuedAt ??
        record.detectedAt,
      affectedSurfaces: dedupeStrings([
        "repair-runtime",
        "knowledge",
        "task-queue",
        ...(record.affectedPaths ?? []),
      ]),
      linkedServiceIds: [],
      linkedTaskIds: dedupeStrings([
        record.sourceTaskId,
        record.repairTaskId,
      ]),
      linkedRunIds: dedupeStrings([
        record.sourceRunId,
        record.repairRunId,
      ]),
      linkedRepairIds: [record.repairId],
      linkedProofDeliveries: [],
      evidence: dedupeStrings([
        ...(record.evidence ?? []),
        record.verificationSummary,
        record.lastError,
      ]),
      recommendedSteps: [
        record.status === "failed"
          ? "Inspect repair evidence and decide whether to rerun or verify manually."
          : "Allow the active repair flow to finish and verify the output.",
      ],
      remediation: {
        owner: record.status === "failed" ? "mixed" : "auto",
        status: record.status === "failed" ? "ready" : "in-progress",
        summary:
          record.status === "failed"
            ? "Repair flow needs operator review."
            : "Repair flow is currently progressing through auto-remediation.",
        nextAction:
          record.status === "failed"
            ? "Inspect repair evidence and decide whether to rerun or verify manually."
            : "Allow the active repair flow to finish and verify the output.",
        blockers: [],
      },
    });
  }

  if (governance.taskRetryRecoveries.count > 0) {
    for (const record of state.taskRetryRecoveries) {
      addIncident({
        fingerprint: buildIncidentFingerprint("retry-recovery", record.idempotencyKey),
        title: `Retry recovery waiting for ${record.type}`,
        classification: "retry-recovery",
        severity: "warning",
        status: "watching",
        truthLayer: "observed",
        summary: `Retry recovery for ${record.type} is queued for replay.`,
        detectedAt: record.retryAt,
        affectedSurfaces: ["task-queue", "worker-runtime"],
        linkedServiceIds: [],
        linkedTaskIds: [record.sourceTaskId],
        linkedRunIds: [record.idempotencyKey],
        linkedRepairIds: [],
        linkedProofDeliveries: [],
        evidence: [
          `retry at: ${record.retryAt}`,
          `attempt: ${record.attempt}`,
          `max retries: ${record.maxRetries}`,
        ],
        recommendedSteps: ["Monitor task runs until persisted retries clear."],
        remediation: {
          owner: "auto",
          status: "in-progress",
          summary: "Persisted retry recoveries are replayed by the orchestrator on schedule.",
          nextAction: "Monitor task runs until persisted retries clear.",
          blockers: [],
        },
      });
    }
  }

  const contradictionSignals = knowledgeRuntime.signals.contradictions ?? [];
  const stalenessSignals = knowledgeRuntime.signals.staleness ?? [];
  if (contradictionSignals.length > 0 || stalenessSignals.length > 0) {
    addIncident({
      fingerprint: buildIncidentFingerprint("knowledge", "runtime-signals"),
      title: "Knowledge runtime drift signals active",
      classification: "knowledge",
      severity: contradictionSignals.length > 0 ? "warning" : "info",
      status: contradictionSignals.length > 0 ? "active" : "watching",
      truthLayer: "observed",
      summary:
        contradictionSignals.length > 0
          ? `${contradictionSignals.length} contradiction signal(s) and ${stalenessSignals.length} freshness signal(s) are active.`
          : `${stalenessSignals.length} knowledge freshness signal(s) are active.`,
      detectedAt:
        knowledgeRuntime.freshness.latestEntryUpdatedAt ??
        knowledgeRuntime.freshness.lastDriftRepairAt ??
        null,
      affectedSurfaces: ["knowledge-base", "doc-index", "agent-context"],
      linkedServiceIds: [],
      linkedTaskIds: [],
      linkedRunIds: [],
      linkedRepairIds: state.repairRecords
        .filter((record) => record.classification === "doc-drift")
        .map((record) => record.repairId)
        .slice(0, 10),
      linkedProofDeliveries: [],
      evidence: [
        ...stalenessSignals.map((signal) => signal.message),
        ...contradictionSignals.slice(0, 5).map((signal: any) => signal.message ?? signal.title),
      ].slice(0, 10),
      recommendedSteps: [
        contradictionSignals.length > 0
          ? "Run drift repair or reconcile conflicting knowledge entries."
          : "Refresh indexed docs and regenerate knowledge packs if aging persists.",
      ],
      remediation: {
        owner: "mixed",
        status: contradictionSignals.length > 0 ? "ready" : "watching",
        summary:
          contradictionSignals.length > 0
            ? "Review contradictions and refresh knowledge packs."
            : "Knowledge aging should be monitored and refreshed as drift repair progresses.",
        nextAction:
          contradictionSignals.length > 0
            ? "Run drift repair or reconcile conflicting knowledge entries."
            : "Refresh indexed docs and regenerate knowledge packs if aging persists.",
        blockers: [],
      },
    });
  }

  const serviceGapAgents = agents.filter(
    (agent) =>
      agent.serviceAvailable &&
      (agent.serviceInstalled === false || agent.serviceRunning === false),
  );
  for (const agent of serviceGapAgents) {
    const runtime = [agent.serviceUnitState, agent.serviceUnitSubState]
      .filter(Boolean)
      .join("/");

    addIncident({
      fingerprint: buildIncidentFingerprint("service-runtime", agent.id),
      title: `${agent.id} service coverage is incomplete`,
      classification: "service-runtime",
      severity: "warning",
      status: "active",
      truthLayer: "observed",
      summary: `${agent.id} has a service entrypoint but is not fully installed or running on this host.`,
      detectedAt: agent.lastEvidenceAt ?? state.updatedAt ?? null,
      affectedSurfaces: [agent.id],
      linkedServiceIds: [getAgentServiceUnitName(agent.id)],
      linkedTaskIds: dedupeStrings([agent.lastSuccessfulTaskId]),
      linkedRunIds: dedupeStrings([agent.lastSuccessfulRunId]),
      linkedRepairIds: [],
      linkedProofDeliveries: [],
      evidence: [
        `${agent.id}: installed=${String(agent.serviceInstalled)}, running=${String(agent.serviceRunning)}${runtime ? ` (${runtime})` : ""}`,
      ],
      recommendedSteps: [
        "Inspect agent systemd unit state and bring the required service up.",
      ],
      remediation: {
        owner: "operator",
        status: "ready",
        summary: "Install or restart the missing agent service unit if it is intended to be live.",
        nextAction: "Inspect agent systemd unit state and bring required services up.",
        blockers: [],
      },
    });
  }

  if (pendingApprovalsCount > 0) {
    const pendingApprovals = listPendingApprovals(state);
    addIncident({
      fingerprint: buildIncidentFingerprint("approval-backlog", "pending"),
      title: "Approval backlog waiting on operator action",
      classification: "approval-backlog",
      severity: pendingApprovalsCount > 3 ? "warning" : "info",
      status: "watching",
      truthLayer: "observed",
      summary: `${pendingApprovalsCount} approval-gated task(s) are paused pending operator review.`,
      detectedAt:
        pendingApprovals
          .map((approval) => approval.requestedAt)
          .sort()
          .at(0) ?? null,
      affectedSurfaces: ["approval-gate", "task-queue"],
      linkedServiceIds: ["orchestrator.service"],
      linkedTaskIds: pendingApprovals
        .map((approval) => approval.taskId)
        .slice(0, 10),
      linkedRunIds: pendingApprovals
        .map(
          (approval) =>
            state.taskExecutions.find((execution) => execution.taskId === approval.taskId)
              ?.idempotencyKey ?? null,
        )
        .filter((value): value is string => Boolean(value))
        .slice(0, 10),
      linkedRepairIds: [],
      linkedProofDeliveries: [],
      evidence: pendingApprovals
        .slice(0, 10)
        .map((approval) => `${approval.type} requested at ${approval.requestedAt}`),
      recommendedSteps: [
        "Review pending approvals and decide whether to approve or reject them.",
      ],
      remediation: {
        owner: "operator",
        status: "ready",
        summary: "Operator review is required before the queued work can resume.",
        nextAction: "Review pending approvals and decide whether to approve or reject them.",
        blockers: [],
      },
    });
  }

  return reconcileRuntimeIncidentLedger(state, candidates);
}

async function bootstrap() {
  // Verify security posture FIRST
  verifySecurityPosture();
  const fastStartMode = process.env.ORCHESTRATOR_FAST_START === "true";

  // Attempt to load the private memory scheduler (gitignored). No-op fallback if absent.
  try {
    // @ts-ignore — module is gitignored (private); only present on production server
    const mod = await import("./memory/scheduler.js");
    memoryScheduler = mod.memoryScheduler;
  } catch {
    /* private module not present — no-op fallback remains active */
  }

  const config = await loadConfig();
  await mkdir(config.logsDir, { recursive: true });
  await mkdir(dirname(config.stateFile), { recursive: true });
  snapshotService.setSnapshotDir(resolve(config.logsDir, "snapshots"));

  console.log("[orchestrator] config loaded", config);
  if (fastStartMode) {
    console.warn(
      "[orchestrator] ⚠️ Fast-start mode enabled: skipping heavy boot stages",
    );
  }

  try {
    const registry = await getAgentRegistry();
    const discoveredAgents = registry.listAgents().map((agent) => agent.id);
    console.log(
      `[orchestrator] agent registry initialized (${discoveredAgents.length} agents)`,
    );
    if (discoveredAgents.length > 0) {
      console.log(`[orchestrator] agents: ${discoveredAgents.join(", ")}`);
    }
  } catch (error) {
    console.warn("[orchestrator] agent registry initialization failed:", error);
  }

  let claimedTruthLayer = buildClaimedTruthLayer(config, 0);
  try {
    const registry = await getAgentRegistry();
    claimedTruthLayer = buildClaimedTruthLayer(
      config,
      registry.listAgents().length,
    );
  } catch {
    claimedTruthLayer = buildClaimedTruthLayer(config, 0);
  }

  // Initialize alerting
  const alertConfig = buildAlertConfig();
  const alertManager = new AlertManager(alertConfig, console);
  const failureTracker = new TaskFailureTracker(alertManager, 3);

  console.log(`[orchestrator] alerts enabled: ${alertConfig.enabled}`);
  if (alertConfig.slackWebhook)
    console.log("[orchestrator] Slack alerting configured");

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
      console.error(
        "[orchestrator] failed to initialize persistence layer:",
        error,
      );
      const strictPersistence =
        config.strictPersistence === true ||
        process.env.STRICT_PERSISTENCE === "true";
      if (strictPersistence) {
        throw new Error(
          "strict persistence enabled and persistence layer failed to initialize",
        );
      }
      console.error(
        "[orchestrator] ⚠️ DEGRADED MODE: persistence unavailable, continuing without Mongo-backed persistence",
      );
    }
  } else {
    console.log(
      "[orchestrator] fast-start: skipping persistence initialization",
    );
  }

  let indexers: DocIndexer[] = [];
  let indexedDocCount = 0;
  const indexRoots = [config.docsPath, config.cookbookPath].filter(
    (value): value is string => Boolean(value),
  );
  if (indexRoots.length > 0) {
    for (const root of indexRoots) {
      try {
        const rootStat = await stat(root);
        if (!rootStat.isDirectory()) {
          throw new Error("configured path is not a directory");
        }

        const indexer = new DocIndexer(root);
        if (!fastStartMode) {
          await indexer.buildInitialIndex();
          indexedDocCount += indexer.getIndex().size;
        }
        indexers.push(indexer);
      } catch (error) {
        console.warn(
          `[orchestrator] document indexing disabled for ${root}: ${(error as Error).message}`,
        );
      }
    }

    if (indexers.length === 0) {
      console.warn(
        "[orchestrator] no readable document roots available for indexing; continuing without doc watchers",
      );
      indexedDocCount = 0;
    } else if (fastStartMode) {
      console.log(
        "[orchestrator] fast-start: deferring initial document index build until after HTTP startup",
      );
    } else {
      console.log(
        `[orchestrator] indexed ${indexedDocCount} docs across ${indexers.length} source(s)`,
      );
    }
  } else {
    console.log("[orchestrator] no document roots configured for indexing");
  }

  const state = await loadState(config.stateFile, {
    taskHistoryLimit: config.taskHistoryLimit,
  });
  state.indexedDocs = indexedDocCount;
  state.docIndexVersion += 1;
  const { recoveredRetryCount, staleRecoveryCount } =
    reconcileTaskRetryRecoveryState(state);

  const flushState = async () => {
    await persistState(config.stateFile, state, {
      taskHistoryLimit: config.taskHistoryLimit,
    });
  };

  const warmDocumentIndexInBackground = async () => {
    if (!fastStartMode || indexers.length === 0) {
      return;
    }

    try {
      let warmCount = 0;
      let readyCount = 0;

      for (const indexer of indexers) {
        try {
          await indexer.buildInitialIndex();
          warmCount += indexer.getIndex().size;
          readyCount += 1;
        } catch (error) {
          console.warn(
            `[orchestrator] skipped document warm-up for one source: ${(error as Error).message}`,
          );
        }
      }

      indexedDocCount = warmCount;
      state.indexedDocs = indexedDocCount;
      state.docIndexVersion += 1;
      await flushState();
      console.log(
        `[orchestrator] indexed ${indexedDocCount} docs across ${readyCount} source(s)`,
      );
      console.log(
        "[orchestrator] fast-start: document index warm-up complete; watch hooks remain enabled for freshness",
      );
    } catch (error) {
      console.error(
        "[orchestrator] failed to warm document index in fast-start mode:",
        error,
      );
    }
  };

  await flushState();
  if (recoveredRetryCount > 0) {
    console.warn(
      `[orchestrator] recovered ${recoveredRetryCount} interrupted retry task(s) as failed after restart`,
    );
  }
  if (staleRecoveryCount > 0) {
    console.warn(
      `[orchestrator] dropped ${staleRecoveryCount} stale persisted retry recovery record(s) during startup reconciliation`,
    );
  }

  // Initialize milestone emitter (no-op if milestoneIngestUrl or MILESTONE_SIGNING_SECRET not set)
  const milestoneEmitter = initMilestoneEmitter(
    config,
    () => state,
    flushState,
  );
  const demandSummaryEmitter = initDemandSummaryEmitter(
    config,
    () => state,
    flushState,
  );

  const taskHistoryLimit = Number.isFinite(config.taskHistoryLimit)
    ? Math.max(
        1,
        Math.min(10000, Math.floor(config.taskHistoryLimit as number)),
      )
    : 50;
  const retryMaxAttempts = Number.isFinite(config.retryMaxAttempts)
    ? Math.max(0, Math.floor(config.retryMaxAttempts as number))
    : 2;
  const retryBackoffMs = Number.isFinite(config.retryBackoffMs)
    ? Math.max(0, Math.floor(config.retryBackoffMs as number))
    : 500;

  const ensureExecutionRecord = (task: Task) => {
    const idempotencyKey =
      typeof task.idempotencyKey === "string" &&
      task.idempotencyKey.trim().length > 0
        ? task.idempotencyKey
        : task.id;
    const existing = state.taskExecutions.find(
      (item) => item.idempotencyKey === idempotencyKey,
    );
    if (existing) {
      return { existing, idempotencyKey };
    }

    const created = {
      taskId: task.id,
      idempotencyKey,
      type: task.type,
      status: "pending" as const,
      attempt: task.attempt ?? 1,
      maxRetries: Number.isFinite(task.maxRetries)
        ? Number(task.maxRetries)
        : retryMaxAttempts,
      lastHandledAt: new Date().toISOString(),
      lastError: undefined as string | undefined,
    };
    state.taskExecutions.push(created);
    return { existing: created, idempotencyKey };
  };

  const resolveTaskActor = (task: Task) =>
    typeof task.payload.__actor === "string" && task.payload.__actor.trim().length > 0
      ? task.payload.__actor.trim()
      : "system";

  const findExecutionByTaskId = (taskId: string) =>
    state.taskExecutions.find((item) => item.taskId === taskId) ?? null;

  const appendTaskWorkflowEvent = (
    task: Task,
    stage: WorkflowEventStage,
    stateLabel: string,
    detail: string,
    options?: {
      source?: string;
      actor?: string | null;
      nodeId?: string;
      evidence?: string[];
      timestamp?: string;
    },
  ) => {
    const { idempotencyKey } = ensureExecutionRecord(task);
    return appendWorkflowEvent({
      state,
      runId: idempotencyKey,
      taskId: task.id,
      type: task.type,
      stage,
      stateLabel,
      source: options?.source ?? "queue",
      actor: options?.actor ?? resolveTaskActor(task),
      nodeId: options?.nodeId ?? `${stage}:${task.type}`,
      detail,
      evidence: options?.evidence ?? [],
      timestamp: options?.timestamp,
    });
  };

  const recordTaskResult = (
    task: Task,
    result: "ok" | "error",
    message?: string,
  ) => {
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
    enqueueTask: (type: string, payload: Record<string, unknown>) =>
      queue.enqueue(type, payload),
    logger: console,
  };
  const retryRecoveryTimers = new Map<string, NodeJS.Timeout>();

  const clearRetryRecoveryTimer = (idempotencyKey: string) => {
    const timer = retryRecoveryTimers.get(idempotencyKey);
    if (!timer) return;
    clearTimeout(timer);
    retryRecoveryTimers.delete(idempotencyKey);
  };

  const findRetryRecovery = (idempotencyKey: string) =>
    state.taskRetryRecoveries.find(
      (record) => record.idempotencyKey === idempotencyKey,
    );

  const findRepairRecordById = (repairId: string) =>
    state.repairRecords.find((record) => record.repairId === repairId) ?? null;

  const syncRepairRecordOnTaskStart = (task: Task, idempotencyKey: string) => {
    const repairId =
      typeof task.payload.__repairId === "string" ? task.payload.__repairId : null;
    if (repairId) {
      updateRepairRecord(state, repairId, (record) => ({
        ...record,
        status: "running",
        startedAt: new Date().toISOString(),
        repairTaskId: task.id,
        repairRunId: idempotencyKey,
      }));
      appendTaskWorkflowEvent(
        task,
        "repair",
        "running",
        `Repair ${repairId} started for ${task.type}.`,
        {
          source: "repair",
          nodeId: repairId,
          evidence: [repairId, task.type],
        },
      );
    }

    const retryRepairId = `retry:${idempotencyKey}`;
    if (findRepairRecordById(retryRepairId)?.status === "queued") {
      updateRepairRecord(state, retryRepairId, (record) => ({
        ...record,
        status: "running",
        startedAt: new Date().toISOString(),
        repairTaskId: task.id,
        repairRunId: idempotencyKey,
      }));
      appendTaskWorkflowEvent(
        task,
        "repair",
        "running",
        `Retry recovery repair ${retryRepairId} started for ${task.type}.`,
        {
          source: "repair",
          nodeId: retryRepairId,
          evidence: [retryRepairId, task.type],
        },
      );
    }
  };

  const syncRepairRecordOnTaskSuccess = (
    task: Task,
    idempotencyKey: string,
    message?: string,
  ) => {
    const completedAt = new Date().toISOString();
    const repairId =
      typeof task.payload.__repairId === "string" ? task.payload.__repairId : null;
    if (repairId) {
      updateRepairRecord(state, repairId, (record) => ({
        ...record,
        status: "verified",
        repairTaskId: task.id,
        repairRunId: idempotencyKey,
        completedAt,
        verifiedAt: completedAt,
        verificationSummary:
          message ?? record.verificationSummary ?? "repair task completed successfully",
        evidence: [
          ...(record.evidence ?? []),
          `task-success:${task.type}`,
        ].slice(-10),
        lastError: undefined,
      }));
      appendTaskWorkflowEvent(
        task,
        "repair",
        "verified",
        message ?? `Repair ${repairId} verified successfully.`,
        {
          source: "repair",
          nodeId: repairId,
          evidence: [repairId, task.type],
          timestamp: completedAt,
        },
      );
    }

    const retryRepairId = `retry:${idempotencyKey}`;
    if (findRepairRecordById(retryRepairId)) {
      updateRepairRecord(state, retryRepairId, (record) => ({
        ...record,
        status: "verified",
        repairTaskId: task.id,
        repairRunId: idempotencyKey,
        completedAt,
        verifiedAt: completedAt,
        verificationSummary:
          message ?? record.verificationSummary ?? "retry recovery completed successfully",
        evidence: [
          ...(record.evidence ?? []),
          `task-success:${task.type}`,
        ].slice(-10),
        lastError: undefined,
      }));
      appendTaskWorkflowEvent(
        task,
        "repair",
        "verified",
        message ?? `Retry recovery ${retryRepairId} completed successfully.`,
        {
          source: "repair",
          nodeId: retryRepairId,
          evidence: [retryRepairId, task.type],
          timestamp: completedAt,
        },
      );
    }
  };

  const syncRepairRecordOnTaskFailure = (
    task: Task,
    idempotencyKey: string,
    err: Error,
    retryScheduled: boolean,
    attempt: number,
    maxRetries: number,
  ) => {
    const completedAt = new Date().toISOString();
    const repairId =
      typeof task.payload.__repairId === "string" ? task.payload.__repairId : null;

    if (repairId && !retryScheduled) {
      updateRepairRecord(state, repairId, (record) => ({
        ...record,
        status: "failed",
        repairTaskId: task.id,
        repairRunId: idempotencyKey,
        completedAt,
        lastError: err.message,
        evidence: [
          ...(record.evidence ?? []),
          `task-failure:${task.type}`,
        ].slice(-10),
      }));
      appendTaskWorkflowEvent(
        task,
        "repair",
        "failed",
        `Repair ${repairId} failed: ${err.message}`,
        {
          source: "repair",
          nodeId: repairId,
          evidence: [repairId, task.type],
          timestamp: completedAt,
        },
      );
    }

    const retryRepairId = `retry:${idempotencyKey}`;
    if (retryScheduled) {
      upsertRepairRecord(state, {
        repairId: retryRepairId,
        classification: "task-retry-recovery",
        trigger: "automatic-retry",
        sourceTaskId: task.id,
        sourceTaskType: task.type,
        sourceRunId: idempotencyKey,
        repairTaskType: task.type,
        repairTaskId: task.id,
        repairRunId: idempotencyKey,
        verificationMode: "task-success",
        status: "queued",
        detectedAt: completedAt,
        queuedAt: completedAt,
        verificationSummary: `retry scheduled after attempt ${attempt} of ${maxRetries + 1}`,
        evidence: [
          `attempt:${attempt}`,
          `maxRetries:${maxRetries}`,
        ],
        lastError: err.message,
      });
      appendTaskWorkflowEvent(
        task,
        "repair",
        "queued",
        `Automatic retry repair ${retryRepairId} queued after failure.`,
        {
          source: "repair",
          nodeId: retryRepairId,
          evidence: [retryRepairId, task.type],
          timestamp: completedAt,
        },
      );
      return;
    }

    if (findRepairRecordById(retryRepairId)) {
      updateRepairRecord(state, retryRepairId, (record) => ({
        ...record,
        status: "failed",
        repairTaskId: task.id,
        repairRunId: idempotencyKey,
        completedAt,
        lastError: err.message,
        evidence: [
          ...(record.evidence ?? []),
          `task-failure:${task.type}`,
        ].slice(-10),
      }));
      appendTaskWorkflowEvent(
        task,
        "repair",
        "failed",
        `Retry recovery ${retryRepairId} failed: ${err.message}`,
        {
          source: "repair",
          nodeId: retryRepairId,
          evidence: [retryRepairId, task.type],
          timestamp: completedAt,
        },
      );
    }
  };

  const upsertRetryRecovery = (record: TaskRetryRecoveryRecord) => {
    const existingIndex = state.taskRetryRecoveries.findIndex(
      (item) => item.idempotencyKey === record.idempotencyKey,
    );
    if (existingIndex >= 0) {
      state.taskRetryRecoveries[existingIndex] = record;
      return;
    }
    state.taskRetryRecoveries.push(record);
  };

  const removeRetryRecovery = (idempotencyKey: string) => {
    const nextRecords = state.taskRetryRecoveries.filter(
      (record) => record.idempotencyKey !== idempotencyKey,
    );
    if (nextRecords.length === state.taskRetryRecoveries.length) return;
    state.taskRetryRecoveries = nextRecords;
    clearRetryRecoveryTimer(idempotencyKey);
  };

  const dispatchRetryRecovery = async (idempotencyKey: string) => {
    retryRecoveryTimers.delete(idempotencyKey);
    const recovery = findRetryRecovery(idempotencyKey);
    if (!recovery) return;

    try {
      queue.enqueue(recovery.type, recovery.payload);
    } catch (error) {
      console.warn(
        `[orchestrator] failed to requeue persisted retry ${recovery.type}: ${(error as Error).message}`,
      );
    }
  };

  const scheduleRetryRecovery = (record: TaskRetryRecoveryRecord) => {
    clearRetryRecoveryTimer(record.idempotencyKey);
    const delay = getRetryRecoveryDelayMs(record);
    const timer = setTimeout(() => {
      dispatchRetryRecovery(record.idempotencyKey).catch((error) => {
        console.warn(
          `[orchestrator] retry recovery dispatch error for ${record.type}: ${(error as Error).message}`,
        );
      });
    }, delay);
    retryRecoveryTimers.set(record.idempotencyKey, timer);
  };

  queue.onEnqueue((task) => {
    const { idempotencyKey } = ensureExecutionRecord(task);
    appendTaskWorkflowEvent(
      task,
      "ingress",
      "accepted",
      `${task.type} accepted into the orchestrator control plane.`,
      {
        source: "queue",
        nodeId: `ingress:${task.type}`,
        evidence: [task.id, idempotencyKey],
        timestamp: new Date(task.createdAt).toISOString(),
      },
    );
    appendTaskWorkflowEvent(
      task,
      "queue",
      "queued",
      `${task.type} queued for processing.`,
      {
        source: "queue",
        nodeId: `queue:${task.type}`,
        evidence: [task.id, idempotencyKey],
        timestamp: new Date(task.createdAt).toISOString(),
      },
    );
  });

  queue.onProcess(async (task) => {
    const { existing: execution, idempotencyKey } = ensureExecutionRecord(task);

    if (execution.status === "retrying" && findRetryRecovery(idempotencyKey)) {
      removeRetryRecovery(idempotencyKey);
    }

    if (execution.status === "success") {
      console.log(
        `[orchestrator] ♻️ Skipping duplicate task ${task.type} (${idempotencyKey})`,
      );
      return;
    }

    execution.status = "running";
    execution.attempt = task.attempt ?? execution.attempt ?? 1;
    execution.maxRetries = Number.isFinite(task.maxRetries)
      ? Number(task.maxRetries)
      : execution.maxRetries;
    execution.lastHandledAt = new Date().toISOString();
    const taskRequirement = TASK_AGENT_SKILL_REQUIREMENTS[task.type];
    if (taskRequirement) {
      appendTaskWorkflowEvent(
        task,
        "agent",
        "selected",
        `${taskRequirement.agentId} selected for ${task.type}.`,
        {
          source: "execution",
          nodeId: taskRequirement.agentId,
          evidence: [taskRequirement.agentId, taskRequirement.skillId],
          timestamp: execution.lastHandledAt,
        },
      );
      appendTaskWorkflowEvent(
        task,
        "agent",
        "worker-dispatched",
        `${taskRequirement.agentId} worker dispatched through ${taskRequirement.skillId}.`,
        {
          source: "execution",
          nodeId: taskRequirement.agentId,
          evidence: [taskRequirement.skillId],
          timestamp: execution.lastHandledAt,
        },
      );
    }
    appendTaskWorkflowEvent(
      task,
      "agent",
      "executing",
      `${task.type} execution started.`,
      {
        source: "execution",
        nodeId: taskRequirement?.agentId ?? `task:${task.type}`,
        evidence: [idempotencyKey, String(task.attempt ?? execution.attempt ?? 1)],
        timestamp: execution.lastHandledAt,
      },
    );
    syncRepairRecordOnTaskStart(task, idempotencyKey);

    const approval = assertApprovalIfRequired(task, state, config);
    if (!approval.allowed) {
      onApprovalRequested(task.id, task.type);
      execution.status = "pending";
      appendTaskWorkflowEvent(
        task,
        "approval",
        "requested",
        approval.reason ?? `Approval requested for ${task.type}.`,
        {
          source: "approval",
          nodeId: `approval:${task.id}`,
          evidence: [task.id, task.type],
        },
      );
      recordTaskResult(task, "ok", approval.reason ?? "awaiting approval");
      getMilestoneEmitter()?.emit({
        milestoneId: `approval.requested.${task.id}`,
        timestampUtc: new Date().toISOString(),
        scope: "governance",
        claim: `Approval requested for ${task.type}.`,
        evidence: [
          {
            type: "log",
            path: config.stateFile,
            summary: "approval request stored in orchestrator state",
          },
        ],
        riskStatus: "at-risk",
        nextAction: "Review the pending approval and either approve or reject the task.",
        source: "orchestrator",
      }, {
        sourceTaskId: task.id,
        sourceRunId: task.idempotencyKey,
        actor: "orchestrator",
      });
      await flushState();
      console.warn(
        `[orchestrator] ⏸️ ${task.type}: ${approval.reason ?? "awaiting approval"}`,
      );
      return;
    }

    const handler = resolveTaskHandler(task);
    try {
      console.log(`[orchestrator] Processing task: ${task.type}`);
      const message = await handler(task, handlerContext);
      execution.status = "success";
      execution.lastError = undefined;
      execution.lastHandledAt = new Date().toISOString();
      appendTaskWorkflowEvent(
        task,
        "result",
        "success",
        typeof message === "string" ? message : `${task.type} completed successfully.`,
        {
          source: "execution",
          nodeId: `result:${task.type}`,
          evidence: [idempotencyKey],
          timestamp: execution.lastHandledAt,
        },
      );
      recordTaskResult(
        task,
        "ok",
        typeof message === "string" ? message : undefined,
      );
      failureTracker.track(task.type, message);
      syncRepairRecordOnTaskSuccess(
        task,
        idempotencyKey,
        typeof message === "string" ? message : undefined,
      );
      console.log(`[orchestrator] ✅ ${task.type}: ${message}`);
    } catch (error) {
      const err = error as Error;
      console.error(`[task] ❌ failed ${task.type}:`, err);
      execution.lastError = err.message;
      execution.lastHandledAt = new Date().toISOString();

      const maxRetries = Number.isFinite(execution.maxRetries)
        ? execution.maxRetries
        : retryMaxAttempts;
      const attempt = Number.isFinite(execution.attempt)
        ? execution.attempt
        : 1;

      if (attempt <= maxRetries) {
        execution.status = "retrying";
        const nextAttempt = attempt + 1;
        const retryPayload = {
          ...task.payload,
          __attempt: nextAttempt,
          maxRetries,
          idempotencyKey,
        };
        const retryRecord: TaskRetryRecoveryRecord = {
          sourceTaskId: task.id,
          idempotencyKey,
          type: task.type,
          payload: retryPayload,
          attempt: nextAttempt,
          maxRetries,
          retryAt: new Date(Date.now() + retryBackoffMs).toISOString(),
          scheduledAt: new Date().toISOString(),
        };
        upsertRetryRecovery(retryRecord);
        scheduleRetryRecovery(retryRecord);
        appendTaskWorkflowEvent(
          task,
          "result",
          "retry-scheduled",
          `Retry ${nextAttempt} scheduled for ${task.type}.`,
          {
            source: "retry-recovery",
            nodeId: `retry:${idempotencyKey}`,
            evidence: [retryRecord.retryAt, String(maxRetries)],
            timestamp: retryRecord.scheduledAt,
          },
        );
      } else {
        execution.status = "failed";
        removeRetryRecovery(idempotencyKey);
      }

      appendTaskWorkflowEvent(
        task,
        "result",
        execution.status === "retrying" ? "warning" : "failed",
        execution.status === "retrying"
          ? `Execution failed and will retry: ${err.message}`
          : `Execution failed: ${err.message}`,
        {
          source: "execution",
          nodeId: `result:${task.type}`,
          evidence: [idempotencyKey],
          timestamp: execution.lastHandledAt,
        },
      );

      syncRepairRecordOnTaskFailure(
        task,
        idempotencyKey,
        err,
        attempt <= maxRetries,
        attempt,
        maxRetries,
      );

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

  if (state.taskRetryRecoveries.length > 0) {
    for (const recovery of state.taskRetryRecoveries) {
      scheduleRetryRecovery(recovery);
    }
    console.log(
      `[orchestrator] scheduled ${state.taskRetryRecoveries.length} persisted retry recovery task(s) after startup`,
    );
  }

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
    cron.schedule("*/5 * * * *", () => {
      demandSummaryEmitter.deliverPending().catch((err) => {
        console.warn("[demand-summary] poller error:", (err as Error).message);
      });
    });
  }

  // Monitor heartbeat failures (detect if orchestrator is hung)
  setInterval(
    () => {
      const timeSinceLastHeartbeat = Date.now() - lastHeartbeatTime;
      const heartbeatThreshold = 15 * 60 * 1000; // 15 minutes

      if (timeSinceLastHeartbeat > heartbeatThreshold) {
        alertManager.critical(
          "orchestrator",
          "Heartbeat missed - orchestrator may be hung",
          {
            timeSinceLastHeartbeatMs: timeSinceLastHeartbeat,
          },
        );
      }
    },
    10 * 60 * 1000,
  ); // Check every 10 minutes

  // Cleanup old alerts periodically
  setInterval(
    () => {
      alertManager.cleanup(48); // Keep alerts for 48 hours
    },
    6 * 60 * 60 * 1000,
  ); // Clean up every 6 hours

  console.log("[orchestrator] 🔔 Alerts configured and monitoring started");
  console.log(
    "[orchestrator] Scheduled 3 cron jobs: nightly-batch (11pm), send-digest (6am), heartbeat (5min)",
  );

  // ============================================================
  // Phase 4: Daily Memory Consolidation System
  // ============================================================

  if (!fastStartMode) {
    memoryScheduler.start();
    console.log(
      "[orchestrator] ⏰ Memory consolidation enabled (hourly snapshots, daily consolidation at 1 AM UTC)",
    );
  } else {
    console.log("[orchestrator] fast-start: skipping memory scheduler startup");
  }

  // ============================================================
  // Phase 5: Knowledge Base Automation
  // ============================================================

  if (!fastStartMode) {
    await knowledgeIntegration.start();
  } else {
    console.log(
      "[orchestrator] fast-start: skipping knowledge integration startup",
    );
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
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb" }));
  app.use(logSecurityEvent);
  app.set("trust proxy", 1);

  const corsPolicy = buildCorsPolicy(config);
  const configuredOrigins = Array.from(corsPolicy.allowedOrigins.values());
  if (configuredOrigins.length > 0) {
    console.log(
      `[cors] allowlist active for ${configuredOrigins.length} origin(s): ${configuredOrigins.join(
        ", ",
      )}`,
    );
  } else {
    console.log(
      "[cors] allowlist is empty (deny-by-default for cross-origin browser requests)",
    );
  }
  console.log(
    `[cors] methods=${corsPolicy.allowedMethods.join(",")} headers=${corsPolicy.allowedHeaders.join(
      ",",
    )} credentials=${corsPolicy.allowCredentials ? "enabled" : "disabled"} maxAge=${corsPolicy.maxAgeSeconds}s`,
  );

  app.use((req, res, next) => {
    const rawOrigin = req.headers.origin;
    if (typeof rawOrigin !== "string" || rawOrigin.trim().length === 0) {
      return next();
    }

    const origin = rawOrigin.trim();
    const originAllowed = isCorsOriginAllowed(req, corsPolicy, origin);
    res.vary("Origin");

    if (!originAllowed) {
      return res.status(403).json({ error: "CORS origin denied" });
    }

    let normalizedOrigin: string;
    try {
      normalizedOrigin = normalizeCorsOrigin(origin);
    } catch {
      return res.status(403).json({ error: "CORS origin denied" });
    }

    res.setHeader("Access-Control-Allow-Origin", normalizedOrigin);
    if (corsPolicy.allowCredentials) {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    if (corsPolicy.exposedHeaders.length > 0) {
      res.setHeader(
        "Access-Control-Expose-Headers",
        corsPolicy.exposedHeaders.join(", "),
      );
    }

    if (req.method.toUpperCase() !== "OPTIONS") {
      return next();
    }

    res.vary("Access-Control-Request-Method");
    res.vary("Access-Control-Request-Headers");

    const requestedMethodRaw = req.headers["access-control-request-method"];
    let requestedMethod: string | null = null;
    if (typeof requestedMethodRaw === "string") {
      try {
        requestedMethod = normalizeCorsMethod(requestedMethodRaw);
      } catch {
        requestedMethod = null;
      }
    }
    if (!requestedMethod || !corsPolicy.allowedMethods.includes(requestedMethod)) {
      return res.status(405).json({ error: "CORS preflight method denied" });
    }

    const requestedHeadersRaw = req.headers["access-control-request-headers"];
    const requestedHeaders =
      typeof requestedHeadersRaw === "string"
        ? requestedHeadersRaw
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
        : [];

    const deniedHeaders = requestedHeaders.filter((header) => {
      try {
        const normalized = normalizeCorsHeader(header).toLowerCase();
        return !corsPolicy.allowedHeadersLower.has(normalized);
      } catch {
        return true;
      }
    });
    if (deniedHeaders.length > 0) {
      return res.status(400).json({
        error: "CORS preflight header denied",
        deniedHeaders,
      });
    }

    res.setHeader(
      "Access-Control-Allow-Methods",
      corsPolicy.allowedMethods.join(", "),
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      corsPolicy.allowedHeaders.join(", "),
    );
    res.setHeader("Access-Control-Max-Age", String(corsPolicy.maxAgeSeconds));

    return res.status(204).send();
  });

  const operatorUiDir = resolve(process.cwd(), "src", "operator-ui");
  app.use("/operator/assets", express.static(operatorUiDir, { index: false }));
  app.get("/operator", (_req, res) => {
    res.sendFile(join(operatorUiDir, "index.html"));
  });
  app.get("/operator/*", (_req, res) => {
    res.sendFile(join(operatorUiDir, "index.html"));
  });

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
      res.json({
        ...summary,
        runtime: buildKnowledgeRuntimeSignals({
          summary,
          config,
          state,
        }),
      });
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

  app.get(
    "/api/auth/me",
    authLimiter,
    requireBearerToken,
    viewerReadLimiter,
    requireRole("viewer"),
    auditProtectedAction("auth.me.read"),
    async (req, res) => {
      const auth = (req as AuthenticatedRequest).auth;
      res.json({
        requestId: auth?.requestId ?? null,
        actor: auth?.actor ?? null,
        role: auth?.role ?? null,
        roles: auth?.roles ?? [],
        apiKeyVersion: auth?.apiKeyVersion ?? null,
        apiKeyLabel: auth?.apiKeyLabel ?? null,
        apiKeyExpiresAt: auth?.apiKeyExpiresAt ?? null,
      });
    },
  );

  app.get(
    "/api/tasks/catalog",
    authLimiter,
    requireBearerToken,
    viewerReadLimiter,
    requireRole("viewer"),
    auditProtectedAction("tasks.catalog.read"),
    async (_req, res) => {
      try {
        res.json({
          generatedAt: new Date().toISOString(),
          tasks: buildOperatorTaskCatalog(config, state),
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  // Manual task trigger endpoint
  app.post(
    "/api/tasks/trigger",
    authLimiter,
    requireBearerToken,
    operatorWriteLimiter,
    requireRole("operator"),
    auditProtectedAction("tasks.trigger.create"),
    createValidationMiddleware(TaskTriggerSchema, "body"),
    async (req: AuthenticatedRequest, res) => {
      try {
        const type = String(req.body.type);
        const payload =
          typeof req.body.payload === "object" && req.body.payload !== null
            ? (req.body.payload as Record<string, unknown>)
            : {};

        const enrichedPayload = {
          ...payload,
          __actor: req.auth?.actor ?? "unknown",
          __role: req.auth?.role ?? "viewer",
          __requestId: req.auth?.requestId ?? null,
        };

        const task = queue.enqueue(type, enrichedPayload);
        res.status(202).json({
          status: "queued",
          taskId: task.id,
          type: task.type,
          createdAt: task.createdAt,
        });
      } catch (error: any) {
        console.error("[api/tasks/trigger] Error", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    },
  );

  // AlertManager webhook endpoint (Phase 3)
  // Uses webhook signature verification instead of bearer token
  app.post(
    "/webhook/alerts",
    webhookLimiter,
    authLimiter,
    verifyWebhookSignature,
    createValidationMiddleware(AlertManagerWebhookSchema, "body"),
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
    },
  );

  app.get(
    "/api/approvals/pending",
    authLimiter,
    requireBearerToken,
    viewerReadLimiter,
    requireRole("operator"),
    auditProtectedAction("approvals.pending.read"),
    async (_req, res) => {
      try {
        const pending = listPendingApprovals(state);
        res.json({
          count: pending.length,
          pending: pending.map((approval) => ({
            ...approval,
            impact: buildApprovalImpactMetadata(approval, config),
            payloadPreview: summarizePayloadPreview(approval.payload),
          })),
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post(
    "/api/approvals/:id/decision",
    authLimiter,
    requireBearerToken,
    operatorWriteLimiter,
    requireRole("operator"),
    auditProtectedAction("approvals.decision.write"),
    createValidationMiddleware(ApprovalDecisionSchema, "body"),
    async (req: AuthenticatedRequest, res) => {
      try {
        const taskId = String(req.params.id);
        const decision = req.body.decision as "approved" | "rejected";
        const actor =
          typeof req.body.actor === "string" ? req.body.actor : "api-user";
        const note =
          typeof req.body.note === "string" ? req.body.note : undefined;
        const approval = decideApproval(state, taskId, decision, actor, note);
        const approvalExecution = findExecutionByTaskId(taskId);

        onApprovalCompleted(
          taskId,
          decision === "approved" ? "approved" : "rejected",
        );

        const consumedQueueItem = consumeReviewQueueItemForApprovalDecision(
          state.redditQueue,
          approval,
        );

        let replayTaskId: string | null = null;
        if (decision === "approved") {
          const replay = queue.enqueue(approval.type, {
            ...approval.payload,
            approvedFromTaskId: approval.taskId,
            __actor: req.auth?.actor ?? actor,
            __role: req.auth?.role ?? "operator",
            __requestId: req.auth?.requestId ?? null,
          });
          replayTaskId = replay.id;
        }

        if (approvalExecution) {
          appendWorkflowEvent({
            state,
            runId: approvalExecution.idempotencyKey,
            taskId: approval.taskId,
            type: approval.type,
            stage: "approval",
            stateLabel: decision,
            source: "approval",
            actor: req.auth?.actor ?? actor,
            nodeId: `approval:${approval.taskId}`,
            detail:
              decision === "approved"
                ? `Approval granted for ${approval.type}.`
                : `Approval rejected for ${approval.type}.`,
            evidence: [
              approval.note ?? "no-operator-note",
              replayTaskId ?? "no-replay-task",
            ],
          });
        }

        getMilestoneEmitter()?.emit({
          milestoneId: `approval.${decision}.${approval.taskId}`,
          timestampUtc: new Date().toISOString(),
          scope: "governance",
          claim:
            decision === "approved"
              ? `Approval granted for ${approval.type}.`
              : `Approval rejected for ${approval.type}.`,
          evidence: [
            {
              type: "log",
              path: config.stateFile,
              summary:
                decision === "approved"
                  ? consumedQueueItem
                    ? "approval marked approved, review-gated queue item consumed, and replay queued"
                    : "approval marked approved and replay queued"
                  : consumedQueueItem
                    ? "approval marked rejected and review-gated queue item removed from backlog"
                    : "approval marked rejected in orchestrator state",
            },
          ],
          riskStatus: decision === "approved" ? "on-track" : "blocked",
          nextAction:
            decision === "approved"
              ? `Monitor replay task ${replayTaskId ?? "queue"} for completion.`
              : "Adjust the payload or operator note before retrying this task.",
          source: "operator",
        }, {
          sourceTaskId: approval.taskId,
          sourceRunId: approvalExecution?.idempotencyKey,
          actor: req.auth?.actor ?? actor,
        });

        await flushState();

        res.json({
          status: "ok",
          approval,
          replayTaskId,
        });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },
  );

  app.post(
    "/api/incidents/:id/acknowledge",
    authLimiter,
    requireBearerToken,
    operatorWriteLimiter,
    requireRole("operator"),
    auditProtectedAction("incidents.acknowledge.write"),
    createValidationMiddleware(IncidentAcknowledgeSchema, "body"),
    async (req: AuthenticatedRequest, res) => {
      try {
        const incident = acknowledgeIncidentRecord(
          state,
          String(req.params.id),
          typeof req.body.actor === "string"
            ? req.body.actor
            : req.auth?.actor ?? "api-user",
          typeof req.body.note === "string" ? req.body.note : undefined,
        );
        await flushState();
        res.json({ status: "ok", incident });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },
  );

  app.post(
    "/api/incidents/:id/owner",
    authLimiter,
    requireBearerToken,
    operatorWriteLimiter,
    requireRole("operator"),
    auditProtectedAction("incidents.owner.write"),
    createValidationMiddleware(IncidentOwnerSchema, "body"),
    async (req: AuthenticatedRequest, res) => {
      try {
        const incident = assignIncidentOwner(
          state,
          String(req.params.id),
          String(req.body.owner),
        );
        await flushState();
        res.json({ status: "ok", incident });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },
  );

  app.get(
    "/api/dashboard/overview",
    authLimiter,
    requireBearerToken,
    viewerReadLimiter,
    requireRole("viewer"),
    auditProtectedAction("dashboard.overview.read"),
    async (_req, res) => {
      try {
        const persistence = await PersistenceIntegration.healthCheck();
        const agents = await buildAgentOperationalOverview(state);
        const pendingApprovals = listPendingApprovals(state);
        const pendingApprovalDetails = pendingApprovals.map((approval) => ({
          ...approval,
          impact: buildApprovalImpactMetadata(approval, config),
          payloadPreview: summarizePayloadPreview(approval.payload),
        }));
        const memory = await buildMemoryOverviewSummary(24);
        const governance = summarizeGovernanceVisibility(state);
        const selfHealing = governance.repairs;
        const queueQueued = queue.getQueuedCount();
        const queueProcessing = queue.getPendingCount();
        const knowledge = knowledgeIntegration.getSummary();
        const knowledgeRuntime = buildKnowledgeRuntimeSignals({
          summary: knowledge,
          config,
          state,
        });
        const proofDelivery = buildProofDeliveryTelemetry(config, state);
        const truthLayers = buildRuntimeTruthLayers({
          claimed: claimedTruthLayer,
          config,
          state,
          fastStartMode,
          persistenceStatus:
            typeof persistence.status === "string" ? persistence.status : "unknown",
          knowledgeRuntime,
          queueQueued,
          queueProcessing,
          pendingApprovalsCount: pendingApprovals.length,
          repairs: selfHealing,
          retryRecoveries: governance.taskRetryRecoveries,
          agents,
          proofDelivery,
        });
        const topology = await buildAgentTopology({ agents, proofDelivery });
        const incidentState = buildRuntimeIncidentModel({
          config,
          state,
          fastStartMode,
          persistence,
          agents,
          governance,
          pendingApprovalsCount: pendingApprovals.length,
          proofDelivery,
          knowledgeRuntime,
        });
        const incidents = incidentState.model;
        if (incidentState.changed) {
          await flushState();
        }
        const overviewHealthStatus =
          incidents.overallStatus === "critical" || truthLayers.observed.status === "degraded"
            ? "degraded"
            : incidents.overallStatus === "warning" || truthLayers.observed.status === "warning"
              ? "warning"
              : "healthy";

        res.json({
          generatedAt: new Date().toISOString(),
          health: {
            status: overviewHealthStatus,
            fastStartMode,
          },
          persistence,
          memory,
          queue: {
            queued: queueQueued,
            processing: queueProcessing,
          },
          approvals: {
            pendingCount: pendingApprovalDetails.length,
            pending: pendingApprovalDetails,
          },
          selfHealing: {
            model: "partial-runtime",
            autoPolicies: ["doc-drift", "task-retry-recovery"],
            summary: selfHealing,
          },
          governance,
          truthLayers,
          proofDelivery,
          topology,
          incidents,
          recentTasks: state.taskHistory.slice(-20),
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.get(
    "/api/agents/overview",
    authLimiter,
    requireBearerToken,
    viewerReadLimiter,
    requireRole("viewer"),
    auditProtectedAction("agents.overview.read"),
    async (_req, res) => {
      try {
        const agents = await buildAgentOperationalOverview(state);
        const proofDelivery = buildProofDeliveryTelemetry(config, state);
        const topology = await buildAgentTopology({ agents, proofDelivery });
        res.json({
          generatedAt: new Date().toISOString(),
          count: agents.length,
          agents,
          topology,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.get(
    "/api/memory/recall",
    authLimiter,
    requireBearerToken,
    viewerReadLimiter,
    requireRole("viewer"),
    auditProtectedAction("memory.recall.read"),
    async (req, res) => {
      try {
        const limit = parseBoundedInt(req.query.limit, 20, 1, 100);
        const offset = parseBoundedInt(req.query.offset, 0, 0, 100000);
        const includeSensitive = parseBoolean(
          req.query.includeSensitive,
          false,
        );
        const includeErrors = parseBoolean(req.query.includeErrors, true);
        const agentIdFilter =
          typeof req.query.agentId === "string" &&
          req.query.agentId.trim().length > 0
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
              ? (memory.taskTimeline ?? [])
              : (memory.taskTimeline ?? []).filter(
                  (entry) => entry.status !== "error",
                );
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
        const totalRuns = items.reduce(
          (sum, item) => sum + Number(item.totalRuns ?? 0),
          0,
        );

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
    authLimiter,
    requireBearerToken,
    operatorWriteLimiter,
    requireRole("operator"),
    auditProtectedAction("knowledge.query.read"),
    createValidationMiddleware(KBQuerySchema, "body"),
    async (req, res) => {
      try {
        const { query } = req.body;
        const results = await knowledgeIntegration.queryAPI(query);
        const summary = knowledgeIntegration.getSummary();
        res.json({
          ...results,
          runtime: buildKnowledgeRuntimeSignals({
            summary,
            config,
            state,
          }),
        });
      } catch (error: any) {
        console.error("[api/knowledge/query] Error", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    },
  );

  // Knowledge Base export endpoint (Phase 5)
  app.get(
    "/api/knowledge/export",
    authLimiter,
    requireBearerToken,
    adminExportLimiter,
    requireRole("admin"),
    auditProtectedAction("knowledge.export.read"),
    (req, res) => {
      try {
        const format = (req.query.format as string) || "markdown";
        const kb = knowledgeIntegration.export(format as "markdown" | "json");

        if (format === "markdown") {
          res.type("text/markdown").send(kb);
        } else {
          res.json(JSON.parse(kb));
        }
      } catch (error: any) {
        console.error("[api/knowledge/export] Error", { error: error.message });
        res.status(500).json({ error: error.message });
      }
    },
  );

  // Persistence historical data endpoint
  app.get(
    "/api/persistence/historical",
    authLimiter,
    requireBearerToken,
    viewerReadLimiter,
    requireRole("viewer"),
    auditProtectedAction("persistence.historical.read"),
    createValidationMiddleware(PersistenceHistoricalSchema, "query"),
    async (req, res) => {
      try {
        const days = parseInt((req.query.days as string) || "30", 10);
        const data = await PersistenceIntegration.getHistoricalData(days);
        res.json(data);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  // Persistence export endpoint
  app.get(
    "/api/persistence/export",
    authLimiter,
    requireBearerToken,
    adminExportLimiter,
    requireRole("admin"),
    auditProtectedAction("persistence.export.read"),
    async (req, res) => {
      try {
        const exportData = await PersistenceIntegration.exportAllData();
        res.json(exportData);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.get(
    "/api/tasks/runs",
    authLimiter,
    requireBearerToken,
    viewerReadLimiter,
    requireRole("viewer"),
    auditProtectedAction("tasks.runs.read"),
    createValidationMiddleware(TaskRunsQuerySchema, "query"),
    async (req, res) => {
      try {
        const type = typeof req.query.type === "string" ? req.query.type : undefined;
        const status =
          typeof req.query.status === "string" ? req.query.status : undefined;
        const limit = Number(req.query.limit ?? 50);
        const offset = Number(req.query.offset ?? 0);

        const filtered = state.taskExecutions.filter((execution) => {
          if (type && execution.type !== type) return false;
          if (status && execution.status !== status) return false;
          return true;
        });

        const sorted = [...filtered].sort((a, b) =>
          b.lastHandledAt.localeCompare(a.lastHandledAt),
        );
        const page = sorted.slice(offset, offset + limit);

        res.json({
          generatedAt: new Date().toISOString(),
          query: { type: type ?? null, status: status ?? null, limit, offset },
          total: filtered.length,
          page: {
            returned: page.length,
            offset,
            limit,
            hasMore: offset + page.length < filtered.length,
          },
          runs: page.map((execution) => buildRunRecord(execution, state, config)),
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.get(
    "/api/tasks/runs/:runId",
    authLimiter,
    requireBearerToken,
    viewerReadLimiter,
    requireRole("viewer"),
    auditProtectedAction("tasks.run.read"),
    async (req, res) => {
      try {
        const runId = String(req.params.runId);
        const execution = state.taskExecutions.find(
          (item) => item.idempotencyKey === runId,
        );

        if (!execution) {
          return res.status(404).json({ error: `Run not found: ${runId}` });
        }

        return res.json({
          generatedAt: new Date().toISOString(),
          run: buildRunRecord(execution, state, config),
        });
      } catch (error: any) {
        return res.status(500).json({ error: error.message });
      }
    },
  );

  app.get(
    "/api/skills/registry",
    authLimiter,
    requireBearerToken,
    viewerReadLimiter,
    requireRole("viewer"),
    auditProtectedAction("skills.registry.read"),
    async (_req, res) => {
      res.json({
        generatedAt: new Date().toISOString(),
        total: state.governedSkillState.length,
        skills: state.governedSkillState.map((skill) => ({
          skillId: skill.skillId,
          name: skill.definition.id,
          description: skill.definition.description,
          trustStatus: skill.trustStatus,
          intakeSource: skill.intakeSource,
          persistenceMode: skill.persistenceMode,
          auditedAt: skill.auditedAt,
          reviewedBy: skill.reviewedBy ?? null,
          reviewedAt: skill.reviewedAt ?? null,
          reviewedNote: skill.reviewNote ?? null,
        })),
      });
    },
  );

  app.get(
    "/api/skills/policy",
    authLimiter,
    requireBearerToken,
    viewerReadLimiter,
    requireRole("viewer"),
    auditProtectedAction("skills.policy.read"),
    (_req, res) => {
      res.json({
        generatedAt: new Date().toISOString(),
        policy: summarizeGovernanceVisibility(state).governedSkills,
      });
    },
  );

  app.get(
    "/api/skills/telemetry",
    authLimiter,
    requireBearerToken,
    viewerReadLimiter,
    requireRole("viewer"),
    auditProtectedAction("skills.telemetry.read"),
    async (_req, res) => {
      try {
        const gate = await getToolGate();
        const toolLog = gate.getLog();
        res.json({
          generatedAt: new Date().toISOString(),
          telemetry: {
            totalInvocations: toolLog.invocations.length,
            allowedCount: toolLog.allowedCount,
            deniedCount: toolLog.deniedCount,
          },
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.get(
    "/api/skills/audit",
    authLimiter,
    requireBearerToken,
    viewerReadLimiter,
    requireRole("viewer"),
    auditProtectedAction("skills.audit.read"),
    createValidationMiddleware(SkillsAuditQuerySchema, "query"),
    async (req, res) => {
      try {
        const limit = Number(req.query.limit ?? 100);
        const offset = Number(req.query.offset ?? 0);
        const deniedOnly = parseBoolean(req.query.deniedOnly, false);
        const gate = await getToolGate();
        const log = deniedOnly
          ? gate.getDeniedInvocations()
          : gate.getLog().invocations;
        const sorted = [...log].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        const items = sorted.slice(offset, offset + limit);

        res.json({
          generatedAt: new Date().toISOString(),
          query: { limit, offset, deniedOnly },
          total: log.length,
          page: {
            returned: items.length,
            offset,
            limit,
            hasMore: offset + items.length < log.length,
          },
          records: items,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.get(
    "/api/health/extended",
    authLimiter,
    requireBearerToken,
    viewerReadLimiter,
    requireRole("viewer"),
    auditProtectedAction("health.extended.read"),
    async (_req, res) => {
      try {
        const persistence = await PersistenceIntegration.healthCheck();
        const agents = await buildAgentOperationalOverview(state);
        const knowledge = knowledgeIntegration.getSummary();
        const knowledgeRuntime = buildKnowledgeRuntimeSignals({
          summary: knowledge,
          config,
          state,
        });
        const governance = summarizeGovernanceVisibility(state);
        const queueQueued = queue.getQueuedCount();
        const queueProcessing = queue.getPendingCount();
        const pendingApprovalsCount = listPendingApprovals(state).length;

        const serviceAvailableCount = agents.filter(
          (agent) => agent.serviceAvailable,
        ).length;
        const serviceInstalledCount = agents.filter(
          (agent) => agent.serviceInstalled === true,
        ).length;
        const serviceRunningCount = agents.filter(
          (agent) => agent.serviceRunning === true,
        ).length;
        const serviceOperationalCount = serviceRunningCount;
        const spawnedWorkerCapableCount = agents.filter(
          (agent) => agent.spawnedWorkerCapable,
        ).length;

        const controlPlaneHealthy = queueProcessing >= 0;
        const dependencyStatus =
          persistence.status === "healthy" ? "healthy" : "degraded";
        const repairSummary = governance.repairs;
        const proofDelivery = buildProofDeliveryTelemetry(config, state);
        const truthLayers = buildRuntimeTruthLayers({
          claimed: claimedTruthLayer,
          config,
          state,
          fastStartMode,
          persistenceStatus:
            typeof persistence.status === "string" ? persistence.status : "unknown",
          knowledgeRuntime,
          queueQueued,
          queueProcessing,
          pendingApprovalsCount,
          repairs: repairSummary,
          retryRecoveries: governance.taskRetryRecoveries,
          agents,
          proofDelivery,
        });
        const topology = await buildAgentTopology({ agents, proofDelivery });
        const incidentState = buildRuntimeIncidentModel({
          config,
          state,
          fastStartMode,
          persistence,
          agents,
          governance,
          pendingApprovalsCount,
          proofDelivery,
          knowledgeRuntime,
        });
        const incidents = incidentState.model;
        if (incidentState.changed) {
          await flushState();
        }
        const healthStatus =
          controlPlaneHealthy &&
          dependencyStatus === "healthy" &&
          incidents.overallStatus === "stable"
            ? "healthy"
            : incidents.overallStatus === "critical" || dependencyStatus !== "healthy"
              ? "degraded"
              : "warning";

        res.json({
          generatedAt: new Date().toISOString(),
          status: healthStatus,
          controlPlane: {
            routing:
              incidents.overallStatus === "critical"
                ? "degraded"
                : controlPlaneHealthy
                  ? incidents.overallStatus === "warning"
                    ? "warning"
                    : "healthy"
                  : "degraded",
            queue: {
              queued: queueQueued,
              processing: queueProcessing,
            },
          },
          workers: {
            declaredAgents: agents.length,
            spawnedWorkerCapableCount,
            serviceAvailableCount,
            serviceInstalledCount,
            serviceRunningCount,
            serviceOperationalCount,
          },
          repairs: {
            model: "partial-runtime",
            activeCount: repairSummary.activeCount,
            verifiedCount: repairSummary.verifiedCount,
            failedCount: repairSummary.failedCount,
            lastDetectedAt: repairSummary.lastDetectedAt,
            lastVerifiedAt: repairSummary.lastVerifiedAt,
            lastFailedAt: repairSummary.lastFailedAt,
          },
          dependencies: {
            persistence,
            knowledge: {
              indexedEntries: knowledge.stats?.total ?? 0,
              conceptCount: knowledge.networkStats?.totalConcepts ?? 0,
            },
          },
          truthLayers,
          proofDelivery,
          topology: {
            status: topology.status,
            counts: topology.counts,
            hotspots: topology.hotspots,
          },
          incidents,
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.get(
    "/api/persistence/summary",
    authLimiter,
    requireBearerToken,
    viewerReadLimiter,
    requireRole("viewer"),
    auditProtectedAction("persistence.summary.read"),
    async (_req, res) => {
      try {
        const summary = await PersistenceIntegration.getOperatorSummary(state);
        res.json(summary);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    },
  );

  const server = app.listen(PORT, () => {
    console.log(`[orchestrator] HTTP server listening on port ${PORT}`);
    void warmDocumentIndexInBackground();
    console.log(
      `[orchestrator] ⚠️  AUTHENTICATION ENABLED - API key required for protected endpoints`,
    );
    console.log(`[orchestrator] Metrics: http://localhost:9100/metrics`);
    console.log(
      `[orchestrator] Alert webhook: POST http://localhost:${PORT}/webhook/alerts (signature required)`,
    );
    console.log(
      `[orchestrator] Knowledge query: POST http://localhost:${PORT}/api/knowledge/query (auth required)`,
    );
    console.log(
      `[orchestrator] Knowledge summary: http://localhost:${PORT}/api/knowledge/summary (public)`,
    );
    console.log(
      `[orchestrator] Persistence health: http://localhost:${PORT}/api/persistence/health (public)`,
    );
    console.log(
      `[orchestrator] Health check: http://localhost:${PORT}/health (public)`,
    );
  });

  // ============================================================
  // Graceful Shutdown Handler (Day 10)
  // ============================================================

  process.on("SIGTERM", async () => {
    if (isShuttingDown) {
      console.log(
        "[orchestrator] SIGTERM received during shutdown, ignoring duplicate signal",
      );
      return;
    }
    isShuttingDown = true;

    console.log(
      "[orchestrator] Received SIGTERM, starting graceful shutdown...",
    );
    server.close(async () => {
      console.log("[orchestrator] HTTP server closed");
      try {
        await PersistenceIntegration.close();
        console.log("[orchestrator] Database connections closed");
      } catch (err) {
        console.error("[orchestrator] Error closing database:", err);
      }
      try {
        await memoryScheduler.stop();
        console.log("[orchestrator] Memory scheduler stopped");
      } catch (err) {
        console.error("[orchestrator] Error stopping scheduler:", err);
      }
      if (forceShutdownTimer) {
        clearTimeout(forceShutdownTimer);
      }
      console.log("[orchestrator] ✅ Graceful shutdown complete");
      process.exit(0);
    });

    // Force kill after 30 seconds if shutdown hasn't completed
    forceShutdownTimer = setTimeout(() => {
      console.error("[orchestrator] Shutdown timeout, forcing exit");
      process.exit(1);
    }, 30000);
  });

  // Handle SIGINT (Ctrl+C)
  process.on("SIGINT", () => {
    console.log("[orchestrator] Received SIGINT, initiating shutdown...");
    process.emit("SIGTERM");
  });

  queue.enqueue("startup", { reason: "orchestrator boot" });
}

if (process.env.OPENCLAW_SKIP_BOOTSTRAP !== "true") {
  bootstrap().catch((err) => {
    console.error("[orchestrator] fatal", err);
    process.exit(1);
  });
}
