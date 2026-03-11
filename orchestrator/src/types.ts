import type { SkillDefinition as RuntimeSkillDefinition } from "./skills/types.js";

export interface OrchestratorConfig {
  docsPath: string;
  cookbookPath?: string;
  logsDir: string;
  stateFile: string;
  taskHistoryLimit?: number;
  strictPersistence?: boolean;
  retryMaxAttempts?: number;
  retryBackoffMs?: number;
  approvalRequiredTaskTypes?: string[];
  deployBaseDir?: string;
  rssConfigPath?: string;
  redditDraftsPath?: string;
  knowledgePackDir?: string;
  notes?: string;
  // Milestone delivery
  milestoneIngestUrl?: string;
  /** Path to write the JSON milestone feed file (polled by the Devvit scheduler). */
  milestoneFeedPath?: string;
  /** If true, git-add + commit + push the feed file on every emit. Requires a git remote. */
  gitPushOnMilestone?: boolean;
  /** Optional signed demand-summary ingest endpoint for openclawdbot. */
  demandSummaryIngestUrl?: string;
  // LLM Integration
  runtimeEngagementOsPath?: string;
  openaiModel?: string;
  openaiMaxTokens?: number;
  openaiTemperature?: number;
  // Digest Settings
  digestDir?: string;
  digestNotificationChannel?: string;
  digestNotificationTarget?: string;
  digestTimeZone?: string;
  // Scheduling
  nightlyBatchSchedule?: string;
  morningNotificationSchedule?: string;
  // CORS (frontend integration)
  corsAllowedOrigins?: string[];
  corsAllowedMethods?: string[];
  corsAllowedHeaders?: string[];
  corsExposedHeaders?: string[];
  corsAllowCredentials?: boolean;
  corsMaxAgeSeconds?: number;
}

export interface DocRecord {
  path: string;
  content: string;
  lastModified: number;
}

export interface Task {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: number;
  idempotencyKey?: string;
  attempt?: number;
  maxRetries?: number;
}

export interface TaskRecord {
  id: string;
  type: string;
  handledAt: string;
  result: "ok" | "error";
  message?: string;
}

export interface ApprovalRecord {
  taskId: string;
  type: string;
  payload: Record<string, unknown>;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
}

export type IncidentLedgerClassification =
  | "runtime-mode"
  | "persistence"
  | "proof-delivery"
  | "repair"
  | "retry-recovery"
  | "knowledge"
  | "service-runtime"
  | "approval-backlog";

export type IncidentLedgerSeverity = "info" | "warning" | "critical";
export type IncidentLedgerTruthLayer = "configured" | "observed" | "public";
export type IncidentLedgerStatus = "active" | "watching" | "resolved";
export type IncidentRemediationOwner = "auto" | "operator" | "mixed";
export type IncidentRemediationStatus =
  | "ready"
  | "in-progress"
  | "blocked"
  | "watching"
  | "resolved";

export interface IncidentLedgerRecord {
  incidentId: string;
  fingerprint: string;
  title: string;
  classification: IncidentLedgerClassification;
  severity: IncidentLedgerSeverity;
  truthLayer: IncidentLedgerTruthLayer;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt?: string | null;
  status: IncidentLedgerStatus;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  acknowledgementNote?: string | null;
  owner?: string | null;
  summary: string;
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
}

export interface TaskExecutionRecord {
  taskId: string;
  idempotencyKey: string;
  type: string;
  status: "pending" | "running" | "success" | "failed" | "retrying";
  attempt: number;
  maxRetries: number;
  lastHandledAt: string;
  lastError?: string;
}

export type WorkflowEventStage =
  | "ingress"
  | "queue"
  | "approval"
  | "agent"
  | "result"
  | "proof"
  | "repair";

export interface WorkflowEventRecord {
  eventId: string;
  runId: string;
  taskId: string;
  type: string;
  stage: WorkflowEventStage;
  state: string;
  timestamp: string;
  source: string;
  actor: string;
  nodeId: string;
  detail: string;
  evidence: string[];
}

export interface TaskRetryRecoveryRecord {
  sourceTaskId: string;
  idempotencyKey: string;
  type: string;
  payload: Record<string, unknown>;
  attempt: number;
  maxRetries: number;
  retryAt: string;
  scheduledAt: string;
}

export type RepairClassification = "doc-drift" | "task-retry-recovery";

export type RepairStatus =
  | "detected"
  | "queued"
  | "running"
  | "verified"
  | "failed";

export type RepairVerificationMode = "knowledge-pack" | "task-success";

export interface RepairRecord {
  repairId: string;
  classification: RepairClassification;
  trigger: string;
  sourceTaskId?: string;
  sourceTaskType?: string;
  sourceRunId?: string;
  repairTaskType: string;
  repairTaskId?: string;
  repairRunId?: string;
  verificationMode: RepairVerificationMode;
  status: RepairStatus;
  detectedAt: string;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
  verifiedAt?: string;
  affectedPaths?: string[];
  verificationSummary?: string;
  evidence?: string[];
  lastError?: string;
}

export interface DriftRepairRecord {
  runId: string;
  requestedBy: string;
  processedPaths: string[];
  generatedPackIds: string[];
  packPaths?: string[];
  docsProcessed?: number;
  updatedAgents: string[];
  durationMs: number;
  completedAt: string;
  notes?: string;
}

export interface RedditQueueItem {
  id: string;
  subreddit: string;
  question: string;
  link?: string;
  queuedAt: string;
  selectedForDraft?: boolean;
  tag?: string;
  pillar?: string;
  feedId?: string;
  entryContent?: string;
  author?: string;
  ctaVariant?: string;
  matchedKeywords?: string[];
  score?: number;
  draftRecordId?: string;
  suggestedReply?: string;
}

export interface RedditReplyRecord {
  queueId: string;
  subreddit: string;
  question: string;
  draftedResponse: string;
  responder: string;
  confidence: number;
  status: "drafted" | "posted" | "error";
  respondedAt: string;
  postedAt?: string;
  link?: string;
  notes?: string;
  rssDraftId?: string;
  devvitPayloadPath?: string;
  packId?: string;
  packPath?: string;
}

export interface AgentDeploymentRecord {
  deploymentId: string;
  agentName: string;
  template: string;
  repoPath: string;
  config: Record<string, unknown>;
  status: "planned" | "deploying" | "deployed" | "retired";
  deployedAt: string;
  notes?: string;
}

export interface RssDraftRecord {
  draftId: string;
  pillar: string;
  feedId: string;
  subreddit: string;
  title: string;
  content: string;
  link: string;
  author?: string;
  matchedKeywords: string[];
  scoreBreakdown: Record<string, number>;
  totalScore: number;
  suggestedReply: string;
  ctaVariant: string;
  tag: "draft" | "priority" | "manual-review";
  queuedAt: string;
}

export interface DemandSummaryTagCounts {
  draft: number;
  priority: number;
  manualReview: number;
}

export interface DemandSummaryTopItem {
  id: string;
  label: string;
  count: number;
}

export type DemandSegmentState = "hot" | "warm" | "idle";

export interface DemandSummarySegment {
  id: string;
  label: string;
  liveSignalCount: number;
  state: DemandSegmentState;
  staticWeight: number;
  clusterLabels: string[];
}

export interface DemandSummarySnapshot {
  summaryId: string;
  generatedAtUtc: string;
  source: "orchestrator";
  queueTotal: number;
  draftTotal: number;
  selectedForDraftTotal: number;
  tagCounts: DemandSummaryTagCounts;
  topPillars: DemandSummaryTopItem[];
  topKeywordClusters: DemandSummaryTopItem[];
  segments: DemandSummarySegment[];
}

import type { MilestoneEvent } from "./milestones/schema.js";

export interface MilestoneDeliveryRecord {
  idempotencyKey: string;
  milestoneId: string;
  sentAtUtc: string;
  event: MilestoneEvent;
  sourceTaskId?: string;
  sourceRunId?: string;
  status:
    | "pending"
    | "delivered"
    | "retrying"
    | "duplicate"
    | "rejected"
    | "dead-letter";
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
}

export interface DemandSummaryDeliveryRecord {
  idempotencyKey: string;
  summaryId: string;
  sentAtUtc: string;
  snapshot: DemandSummarySnapshot;
  sourceTaskId?: string;
  sourceRunId?: string;
  status:
    | "pending"
    | "delivered"
    | "retrying"
    | "duplicate"
    | "rejected"
    | "dead-letter";
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
}

export type GovernedSkillPersistenceMode = "restart-safe" | "metadata-only";

export interface GovernedSkillProvenanceSnapshot {
  author: string;
  source: string;
  version: string;
}

export interface PersistedGovernedSkillExecutorBinding {
  type: "builtin-skill";
  skillId: string;
}

export interface PersistedGovernedSkillRecord {
  skillId: string;
  definition: RuntimeSkillDefinition;
  auditedAt: string;
  intakeSource: "generated" | "imported" | "manual";
  registeredBy?: string;
  trustStatus: "pending-review" | "review-approved";
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  provenanceSnapshot: GovernedSkillProvenanceSnapshot;
  persistenceMode: GovernedSkillPersistenceMode;
  executorBinding?: PersistedGovernedSkillExecutorBinding;
}

export interface OrchestratorState {
  lastStartedAt: string | null;
  updatedAt: string | null;
  indexedDocs: number;
  docIndexVersion: number;
  pendingDocChanges: string[];
  taskHistory: TaskRecord[];
  taskExecutions: TaskExecutionRecord[];
  approvals: ApprovalRecord[];
  driftRepairs: DriftRepairRecord[];
  repairRecords: RepairRecord[];
  taskRetryRecoveries: TaskRetryRecoveryRecord[];
  redditQueue: RedditQueueItem[];
  redditResponses: RedditReplyRecord[];
  agentDeployments: AgentDeploymentRecord[];
  rssDrafts: RssDraftRecord[];
  rssSeenIds: string[];
  governedSkillState: PersistedGovernedSkillRecord[];
  milestoneDeliveries: MilestoneDeliveryRecord[];
  demandSummaryDeliveries: DemandSummaryDeliveryRecord[];
  incidentLedger: IncidentLedgerRecord[];
  workflowEvents: WorkflowEventRecord[];
  lastDriftRepairAt: string | null;
  lastRedditResponseAt: string | null;
  lastAgentDeployAt: string | null;
  lastRssSweepAt: string | null;
  lastNightlyBatchAt?: string | null;
  lastDigestNotificationAt?: string | null;
  lastMilestoneDeliveryAt?: string | null;
  lastDemandSummaryDeliveryAt?: string | null;
}

export interface TaskHandlerContext {
  config: OrchestratorConfig;
  state: OrchestratorState;
  saveState: () => Promise<void>;
  enqueueTask: (type: string, payload: Record<string, unknown>) => Task;
  logger: Console;
}

export type TaskHandler = (
  task: Task,
  context: TaskHandlerContext,
) => Promise<string | void>;
// Skill and Permission Types
export interface SkillPermissions {
  fileRead?: boolean | string[];
  fileWrite?: boolean | string[];
  networkAllowed?: boolean | string[];
  execAllowed?: boolean | string[];
  eval?: boolean;
  spawn?: boolean;
  secrets?: boolean;
}

export interface SkillProvenance {
  source: string;
  version: string;
  license?: string;
  maintainedAt?: string;
}

export interface SkillSchema {
  type: string;
  properties: Record<string, any>;
  required?: string[];
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  provenance: SkillProvenance;
  permissions: SkillPermissions;
  inputs: SkillSchema;
  outputs: SkillSchema;
}

export interface SkillAuditCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  detail?: string;
}

export interface SkillAuditResults {
  passed: boolean;
  runAt: string;
  checks: SkillAuditCheck[];
  riskFlags: string[];
  recommendations: string[];
}

export interface ToolInvocation {
  id: string;
  agentId: string;
  skillId: string;
  args: Record<string, any>;
  timestamp: string;
  mode?: string;
  taskType?: string;
  allowed: boolean;
  reason?: string;
}

export interface ToolInvocationLog {
  success: boolean;
  invocations: ToolInvocation[];
  deniedCount: number;
  allowedCount: number;
}
