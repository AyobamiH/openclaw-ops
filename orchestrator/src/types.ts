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
  redditQueue: RedditQueueItem[];
  redditResponses: RedditReplyRecord[];
  agentDeployments: AgentDeploymentRecord[];
  rssDrafts: RssDraftRecord[];
  rssSeenIds: string[];
  milestoneDeliveries: MilestoneDeliveryRecord[];
  demandSummaryDeliveries: DemandSummaryDeliveryRecord[];
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
  allowed: boolean;
  reason?: string;
}

export interface ToolInvocationLog {
  success: boolean;
  invocations: ToolInvocation[];
  deniedCount: number;
  allowedCount: number;
}
