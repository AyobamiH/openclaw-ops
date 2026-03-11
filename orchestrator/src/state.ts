import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import {
  IncidentAcknowledgementRecord,
  IncidentHistoryEvent,
  IncidentLedgerRecord,
  IncidentOwnershipRecord,
  IncidentRemediationTaskRecord,
  OrchestratorState,
  RepairRecord,
  TaskRetryRecoveryRecord,
  WorkflowEventRecord,
} from "./types.js";

const DEFAULT_HISTORY_LIMIT = 50;
const DRIFT_LOG_LIMIT = 25;
const REDDIT_RESPONSE_LIMIT = 100;
const AGENT_DEPLOYMENT_LIMIT = 50;
const RSS_DRAFT_LIMIT = 200;
const RSS_SEEN_LIMIT = 400;
const REDDIT_QUEUE_LIMIT = 100;
const APPROVALS_LIMIT = 1000;
const TASK_EXECUTION_LIMIT = 5000;
const TASK_RETRY_RECOVERY_LIMIT = 1000;
const REPAIR_RECORD_LIMIT = 500;
const MILESTONE_DELIVERY_LIMIT = 200;
const DEMAND_SUMMARY_DELIVERY_LIMIT = 200;
const INCIDENT_LEDGER_LIMIT = 1000;
const WORKFLOW_EVENT_LIMIT = 20000;

type StateRetentionOptions = {
  taskHistoryLimit?: number;
};

function normalizeTaskHistoryLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_HISTORY_LIMIT;
  const clamped = Math.floor(limit as number);
  if (clamped < 1) return 1;
  if (clamped > 10000) return 10000;
  return clamped;
}

function normalizeStringArray(values: unknown, limit: number = 100) {
  if (!Array.isArray(values)) return [] as string[];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))].slice(-limit);
}

function normalizeIncidentHistoryEvent(value: unknown): IncidentHistoryEvent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<IncidentHistoryEvent>;
  if (typeof raw.id !== "string" || typeof raw.timestamp !== "string" || typeof raw.type !== "string" || typeof raw.summary !== "string") {
    return null;
  }
  return {
    id: raw.id,
    timestamp: raw.timestamp,
    type: raw.type as IncidentHistoryEvent["type"],
    actor: typeof raw.actor === "string" ? raw.actor : null,
    summary: raw.summary,
    detail: typeof raw.detail === "string" ? raw.detail : null,
    evidence: normalizeStringArray(raw.evidence, 25),
  };
}

function normalizeIncidentAcknowledgement(
  value: unknown,
): IncidentAcknowledgementRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<IncidentAcknowledgementRecord>;
  if (
    typeof raw.acknowledgedAt !== "string" ||
    typeof raw.acknowledgedBy !== "string"
  ) {
    return null;
  }
  return {
    acknowledgedAt: raw.acknowledgedAt,
    acknowledgedBy: raw.acknowledgedBy,
    note: typeof raw.note === "string" ? raw.note : null,
  };
}

function normalizeIncidentOwnership(
  value: unknown,
): IncidentOwnershipRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<IncidentOwnershipRecord>;
  if (typeof raw.changedAt !== "string" || typeof raw.changedBy !== "string") {
    return null;
  }
  return {
    changedAt: raw.changedAt,
    changedBy: raw.changedBy,
    previousOwner:
      typeof raw.previousOwner === "string" ? raw.previousOwner : null,
    nextOwner: typeof raw.nextOwner === "string" ? raw.nextOwner : null,
    note: typeof raw.note === "string" ? raw.note : null,
  };
}

function normalizeIncidentRemediationTask(
  value: unknown,
): IncidentRemediationTaskRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<IncidentRemediationTaskRecord>;
  if (
    typeof raw.remediationId !== "string" ||
    typeof raw.createdAt !== "string" ||
    typeof raw.createdBy !== "string" ||
    typeof raw.taskType !== "string" ||
    typeof raw.taskId !== "string" ||
    typeof raw.status !== "string" ||
    typeof raw.reason !== "string"
  ) {
    return null;
  }
  return {
    remediationId: raw.remediationId,
    createdAt: raw.createdAt,
    createdBy: raw.createdBy,
    taskType: raw.taskType,
    taskId: raw.taskId,
    runId: typeof raw.runId === "string" ? raw.runId : null,
    status: raw.status as IncidentRemediationTaskRecord["status"],
    reason: raw.reason,
    note: typeof raw.note === "string" ? raw.note : null,
  };
}

function normalizeIncidentLedgerRecord(record: IncidentLedgerRecord) {
  return {
    ...record,
    affectedSurfaces: normalizeStringArray(record.affectedSurfaces, 25),
    linkedServiceIds: normalizeStringArray(record.linkedServiceIds, 25),
    linkedTaskIds: normalizeStringArray(record.linkedTaskIds, 50),
    linkedRunIds: normalizeStringArray(record.linkedRunIds, 50),
    linkedRepairIds: normalizeStringArray(record.linkedRepairIds, 50),
    linkedProofDeliveries: normalizeStringArray(record.linkedProofDeliveries, 25),
    evidence: normalizeStringArray(record.evidence, 25),
    recommendedSteps: normalizeStringArray(record.recommendedSteps, 25),
    remediation: {
      ...record.remediation,
      blockers: normalizeStringArray(record.remediation?.blockers, 25),
    },
    history: Array.isArray(record.history)
      ? record.history
          .map(normalizeIncidentHistoryEvent)
          .filter((item): item is IncidentHistoryEvent => item !== null)
          .slice(-100)
      : [],
    acknowledgements: Array.isArray(record.acknowledgements)
      ? record.acknowledgements
          .map(normalizeIncidentAcknowledgement)
          .filter((item): item is IncidentAcknowledgementRecord => item !== null)
          .slice(-50)
      : [],
    ownershipHistory: Array.isArray(record.ownershipHistory)
      ? record.ownershipHistory
          .map(normalizeIncidentOwnership)
          .filter((item): item is IncidentOwnershipRecord => item !== null)
          .slice(-50)
      : [],
    remediationTasks: Array.isArray(record.remediationTasks)
      ? record.remediationTasks
          .map(normalizeIncidentRemediationTask)
          .filter((item): item is IncidentRemediationTaskRecord => item !== null)
          .slice(-50)
      : [],
  };
}

export async function loadState(
  path: string,
  options: StateRetentionOptions = {},
): Promise<OrchestratorState> {
  const historyLimit = normalizeTaskHistoryLimit(options.taskHistoryLimit);

  if (!existsSync(path)) {
    return createDefaultState();
  }

  const raw = await readFile(path, "utf-8");
  try {
    const parsed = JSON.parse(raw) as OrchestratorState;
    return {
      ...createDefaultState(),
      ...parsed,
      taskHistory: parsed.taskHistory?.slice(-historyLimit) ?? [],
      taskExecutions: parsed.taskExecutions?.slice(-TASK_EXECUTION_LIMIT) ?? [],
      approvals: parsed.approvals?.slice(-APPROVALS_LIMIT) ?? [],
      pendingDocChanges: parsed.pendingDocChanges ?? [],
      driftRepairs: parsed.driftRepairs ?? [],
      repairRecords: parsed.repairRecords?.slice(-REPAIR_RECORD_LIMIT) ?? [],
      taskRetryRecoveries:
        parsed.taskRetryRecoveries?.slice(-TASK_RETRY_RECOVERY_LIMIT) ?? [],
      redditQueue: parsed.redditQueue?.slice(0, REDDIT_QUEUE_LIMIT) ?? [],
      redditResponses: parsed.redditResponses ?? [],
      agentDeployments: parsed.agentDeployments ?? [],
      rssDrafts: parsed.rssDrafts ?? [],
      rssSeenIds: parsed.rssSeenIds ?? [],
      governedSkillState: parsed.governedSkillState ?? [],
      milestoneDeliveries:
        parsed.milestoneDeliveries?.slice(-MILESTONE_DELIVERY_LIMIT) ?? [],
      demandSummaryDeliveries:
        parsed.demandSummaryDeliveries?.slice(-DEMAND_SUMMARY_DELIVERY_LIMIT) ??
        [],
      incidentLedger:
        parsed.incidentLedger
          ?.slice(-INCIDENT_LEDGER_LIMIT)
          .map(normalizeIncidentLedgerRecord) ?? [],
      workflowEvents:
        parsed.workflowEvents?.slice(-WORKFLOW_EVENT_LIMIT) ?? [],
    };
  } catch (error) {
    console.warn(
      `[state] Failed to parse state file, starting fresh: ${(error as Error).message}`,
    );
    return createDefaultState();
  }
}

export async function saveState(path: string, state: OrchestratorState) {
  await saveStateWithOptions(path, state, {});
}

export async function saveStateWithOptions(
  path: string,
  state: OrchestratorState,
  options: StateRetentionOptions = {},
) {
  const historyLimit = normalizeTaskHistoryLimit(options.taskHistoryLimit);
  await mkdir(dirname(path), { recursive: true });
  const prepared: OrchestratorState = {
    ...state,
    taskHistory: state.taskHistory.slice(-historyLimit),
    taskExecutions: state.taskExecutions.slice(-TASK_EXECUTION_LIMIT),
    approvals: state.approvals.slice(-APPROVALS_LIMIT),
    pendingDocChanges: state.pendingDocChanges.slice(0, 200),
    driftRepairs: state.driftRepairs.slice(-DRIFT_LOG_LIMIT),
    repairRecords: state.repairRecords.slice(-REPAIR_RECORD_LIMIT),
    taskRetryRecoveries: state.taskRetryRecoveries.slice(
      -TASK_RETRY_RECOVERY_LIMIT,
    ),
    redditQueue: state.redditQueue.slice(0, REDDIT_QUEUE_LIMIT),
    redditResponses: state.redditResponses.slice(-REDDIT_RESPONSE_LIMIT),
    agentDeployments: state.agentDeployments.slice(-AGENT_DEPLOYMENT_LIMIT),
    rssDrafts: state.rssDrafts.slice(-RSS_DRAFT_LIMIT),
    rssSeenIds: state.rssSeenIds.slice(-RSS_SEEN_LIMIT),
    governedSkillState: state.governedSkillState,
    milestoneDeliveries: state.milestoneDeliveries.slice(
      -MILESTONE_DELIVERY_LIMIT,
    ),
    demandSummaryDeliveries: state.demandSummaryDeliveries.slice(
      -DEMAND_SUMMARY_DELIVERY_LIMIT,
    ),
    incidentLedger: state.incidentLedger.slice(-INCIDENT_LEDGER_LIMIT),
    workflowEvents: state.workflowEvents.slice(-WORKFLOW_EVENT_LIMIT),
    updatedAt: new Date().toISOString(),
  };

  await writeFile(path, JSON.stringify(prepared, null, 2), "utf-8");
}

export function createDefaultState(): OrchestratorState {
  return {
    lastStartedAt: null,
    updatedAt: null,
    indexedDocs: 0,
    docIndexVersion: 0,
    pendingDocChanges: [],
    taskHistory: [],
    taskExecutions: [],
    approvals: [],
    driftRepairs: [],
    repairRecords: [],
    taskRetryRecoveries: [],
    redditQueue: [],
    redditResponses: [],
    agentDeployments: [],
    rssDrafts: [],
    rssSeenIds: [],
    governedSkillState: [],
    milestoneDeliveries: [],
    demandSummaryDeliveries: [],
    incidentLedger: [],
    workflowEvents: [],
    lastMilestoneDeliveryAt: null,
    lastDemandSummaryDeliveryAt: null,
    lastDriftRepairAt: null,
    lastRedditResponseAt: null,
    lastAgentDeployAt: null,
    lastRssSweepAt: null,
  };
}

export function appendWorkflowEventRecord(
  state: OrchestratorState,
  event: WorkflowEventRecord,
) {
  state.workflowEvents.push(event);
  if (state.workflowEvents.length > WORKFLOW_EVENT_LIMIT) {
    state.workflowEvents = state.workflowEvents.slice(-WORKFLOW_EVENT_LIMIT);
  }
}

export function appendIncidentLedgerRecord(
  state: OrchestratorState,
  record: IncidentLedgerRecord,
) {
  state.incidentLedger.push(record);
  if (state.incidentLedger.length > INCIDENT_LEDGER_LIMIT) {
    state.incidentLedger = state.incidentLedger.slice(-INCIDENT_LEDGER_LIMIT);
  }
}

export function reconcileTaskRetryRecoveryState(
  state: OrchestratorState,
  now: string = new Date().toISOString(),
) {
  const retryRecoveryKeys = new Set(
    state.taskRetryRecoveries.map((record) => record.idempotencyKey),
  );
  let recoveredRetryCount = 0;

  for (const execution of state.taskExecutions) {
    if (execution.status !== "retrying") continue;
    if (retryRecoveryKeys.has(execution.idempotencyKey)) continue;

    const baseMessage =
      execution.lastError && execution.lastError.trim().length > 0
        ? execution.lastError
        : "retry interrupted before requeue";
    const recoveryMessage = `${baseMessage} (orchestrator restarted before retry dispatch)`;

    execution.status = "failed";
    execution.lastHandledAt = now;
    execution.lastError = recoveryMessage;
    state.taskHistory.push({
      id: execution.taskId,
      type: execution.type,
      handledAt: now,
      result: "error",
      message: recoveryMessage,
    });
    recoveredRetryCount += 1;
  }

  const executionsByKey = new Map(
    state.taskExecutions.map((execution) => [execution.idempotencyKey, execution]),
  );
  const staleRecoveryCount =
    state.taskRetryRecoveries.length -
    state.taskRetryRecoveries.filter((record) => {
      const execution = executionsByKey.get(record.idempotencyKey);
      return execution?.status === "retrying";
    }).length;

  state.taskRetryRecoveries = state.taskRetryRecoveries.filter((record) => {
    const execution = executionsByKey.get(record.idempotencyKey);
    return execution?.status === "retrying";
  });

  return { recoveredRetryCount, staleRecoveryCount };
}

export function getRetryRecoveryDelayMs(
  record: TaskRetryRecoveryRecord,
  nowMs: number = Date.now(),
) {
  const retryAtMs = Date.parse(record.retryAt);
  if (!Number.isFinite(retryAtMs)) return 0;
  return Math.max(0, retryAtMs - nowMs);
}

export type GovernanceVisibilitySummary = {
  approvals: {
    pendingCount: number;
  };
  repairs: {
    totalCount: number;
    activeCount: number;
    verifiedCount: number;
    failedCount: number;
    lastDetectedAt: string | null;
    lastVerifiedAt: string | null;
    lastFailedAt: string | null;
  };
  taskRetryRecoveries: {
    count: number;
    nextRetryAt: string | null;
  };
  milestoneDeliveries: DeliveryVisibilitySummary;
  demandSummaryDeliveries: DeliveryVisibilitySummary;
  governedSkills: {
    totalCount: number;
    pendingReviewCount: number;
    approvedCount: number;
    restartSafeCount: number;
    restartSafeApprovedCount: number;
    metadataOnlyCount: number;
    metadataOnlyApprovedCount: number;
  };
};

export type DeliveryVisibilitySummary = {
  pendingCount: number;
  retryingCount: number;
  deadLetterCount: number;
  deliveredCount: number;
  duplicateCount: number;
  rejectedCount: number;
  lastAttemptAt: string | null;
  lastDeliveredAt: string | null;
  oldestPendingAt: string | null;
  latestQueuedAt: string | null;
  lastError: string | null;
};

export function summarizeDeliveryRecords(
  records: Array<{
    status: string;
    sentAtUtc?: string;
    lastAttemptAt?: string;
    lastError?: string;
  }>,
): DeliveryVisibilitySummary {
  return records.reduce<DeliveryVisibilitySummary>(
    (summary, record) => {
      if (record.status === "pending") summary.pendingCount += 1;
      if (record.status === "retrying") summary.retryingCount += 1;
      if (record.status === "dead-letter") summary.deadLetterCount += 1;
      if (record.status === "delivered") summary.deliveredCount += 1;
      if (record.status === "duplicate") summary.duplicateCount += 1;
      if (record.status === "rejected") summary.rejectedCount += 1;

      if (
        record.sentAtUtc &&
        (!summary.latestQueuedAt ||
          Date.parse(record.sentAtUtc) > Date.parse(summary.latestQueuedAt))
      ) {
        summary.latestQueuedAt = record.sentAtUtc;
      }

      if (
        (record.status === "pending" || record.status === "retrying") &&
        record.sentAtUtc &&
        (!summary.oldestPendingAt ||
          Date.parse(record.sentAtUtc) < Date.parse(summary.oldestPendingAt))
      ) {
        summary.oldestPendingAt = record.sentAtUtc;
      }

      if (
        record.lastAttemptAt &&
        (!summary.lastAttemptAt ||
          Date.parse(record.lastAttemptAt) > Date.parse(summary.lastAttemptAt))
      ) {
        summary.lastAttemptAt = record.lastAttemptAt;
      }

      if (
        (record.status === "delivered" || record.status === "duplicate") &&
        record.lastAttemptAt &&
        (!summary.lastDeliveredAt ||
          Date.parse(record.lastAttemptAt) > Date.parse(summary.lastDeliveredAt))
      ) {
        summary.lastDeliveredAt = record.lastAttemptAt;
      }

      if (
        record.lastError &&
        (!summary.lastAttemptAt ||
          !record.lastAttemptAt ||
          Date.parse(record.lastAttemptAt) >= Date.parse(summary.lastAttemptAt))
      ) {
        summary.lastError = record.lastError;
      }

      return summary;
    },
    {
      pendingCount: 0,
      retryingCount: 0,
      deadLetterCount: 0,
      deliveredCount: 0,
      duplicateCount: 0,
      rejectedCount: 0,
      lastAttemptAt: null,
      lastDeliveredAt: null,
      oldestPendingAt: null,
      latestQueuedAt: null,
      lastError: null,
    },
  );
}

export function upsertRepairRecord(
  state: OrchestratorState,
  record: RepairRecord,
) {
  const existingIndex = state.repairRecords.findIndex(
    (item) => item.repairId === record.repairId,
  );
  if (existingIndex >= 0) {
    state.repairRecords[existingIndex] = record;
  } else {
    state.repairRecords.push(record);
  }
  state.repairRecords = state.repairRecords.slice(-REPAIR_RECORD_LIMIT);
}

export function updateRepairRecord(
  state: OrchestratorState,
  repairId: string,
  updater: (record: RepairRecord) => RepairRecord,
) {
  const existing = state.repairRecords.find((item) => item.repairId === repairId);
  if (!existing) return null;
  const next = updater(existing);
  upsertRepairRecord(state, next);
  return next;
}

export function summarizeGovernanceVisibility(
  state: OrchestratorState,
): GovernanceVisibilitySummary {
  const nextRetryAt =
    state.taskRetryRecoveries
      .map((record) => record.retryAt)
      .filter((retryAt) => Number.isFinite(Date.parse(retryAt)))
      .sort()[0] ?? null;

  const milestoneDeliveries = summarizeDeliveryRecords(state.milestoneDeliveries);

  const demandSummaryDeliveries = summarizeDeliveryRecords(
    state.demandSummaryDeliveries,
  );

  const governedSkills = state.governedSkillState.reduce(
    (summary, record) => {
      summary.totalCount += 1;
      if (record.trustStatus === "pending-review") summary.pendingReviewCount += 1;
      if (record.trustStatus === "review-approved") summary.approvedCount += 1;

      if (record.persistenceMode === "restart-safe") {
        summary.restartSafeCount += 1;
        if (record.trustStatus === "review-approved") {
          summary.restartSafeApprovedCount += 1;
        }
      }

      if (record.persistenceMode === "metadata-only") {
        summary.metadataOnlyCount += 1;
        if (record.trustStatus === "review-approved") {
          summary.metadataOnlyApprovedCount += 1;
        }
      }

      return summary;
    },
    {
      totalCount: 0,
      pendingReviewCount: 0,
      approvedCount: 0,
      restartSafeCount: 0,
      restartSafeApprovedCount: 0,
      metadataOnlyCount: 0,
      metadataOnlyApprovedCount: 0,
    },
  );

  const repairs = state.repairRecords.reduce(
    (summary, record) => {
      summary.totalCount += 1;
      if (record.status === "queued" || record.status === "running") {
        summary.activeCount += 1;
      }
      if (record.status === "verified") {
        summary.verifiedCount += 1;
        if (
          !summary.lastVerifiedAt ||
          Date.parse(record.verifiedAt ?? record.completedAt ?? record.detectedAt) >
            Date.parse(summary.lastVerifiedAt)
        ) {
          summary.lastVerifiedAt =
            record.verifiedAt ?? record.completedAt ?? record.detectedAt;
        }
      }
      if (record.status === "failed") {
        summary.failedCount += 1;
        if (
          !summary.lastFailedAt ||
          Date.parse(record.completedAt ?? record.detectedAt) >
            Date.parse(summary.lastFailedAt)
        ) {
          summary.lastFailedAt = record.completedAt ?? record.detectedAt;
        }
      }
      if (
        !summary.lastDetectedAt ||
        Date.parse(record.detectedAt) > Date.parse(summary.lastDetectedAt)
      ) {
        summary.lastDetectedAt = record.detectedAt;
      }
      return summary;
    },
    {
      totalCount: 0,
      activeCount: 0,
      verifiedCount: 0,
      failedCount: 0,
      lastDetectedAt: null as string | null,
      lastVerifiedAt: null as string | null,
      lastFailedAt: null as string | null,
    },
  );

  return {
    approvals: {
      pendingCount: state.approvals.filter((approval) => approval.status === "pending")
        .length,
    },
    repairs,
    taskRetryRecoveries: {
      count: state.taskRetryRecoveries.length,
      nextRetryAt,
    },
    milestoneDeliveries,
    demandSummaryDeliveries,
    governedSkills,
  };
}
