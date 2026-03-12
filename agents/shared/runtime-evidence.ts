import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface RuntimeTaskExecution {
  taskId?: string;
  idempotencyKey?: string;
  type?: string;
  status?: string;
  attempt?: number;
  maxRetries?: number;
  lastHandledAt?: string | null;
  lastError?: string;
}

export interface RuntimeApprovalRecord {
  status?: string;
}

export interface RuntimeRepairRecord {
  repairId?: string;
  classification?: string;
  status?: string;
  repairTaskType?: string;
  sourceTaskType?: string;
  repairTaskId?: string;
  repairRunId?: string;
  sourceTaskId?: string;
  sourceRunId?: string;
  verifiedAt?: string | null;
  completedAt?: string | null;
  lastError?: string;
}

export interface RuntimeIncidentRemediationTask {
  remediationId?: string;
  taskType?: string;
  taskId?: string;
  runId?: string | null;
  status?: string;
  assignedTo?: string | null;
  assignedAt?: string | null;
  executionStartedAt?: string | null;
  executionCompletedAt?: string | null;
  verificationStartedAt?: string | null;
  verificationCompletedAt?: string | null;
  verifiedAt?: string | null;
  resolvedAt?: string | null;
  verificationSummary?: string | null;
  resolutionSummary?: string | null;
  blockers?: string[];
}

export interface RuntimeIncidentRemediationPlanStep {
  stepId?: string;
  title?: string;
  kind?: string;
  owner?: string;
  status?: string;
  description?: string;
  taskType?: string | null;
  dependsOn?: string[];
  startedAt?: string | null;
  completedAt?: string | null;
  evidence?: string[];
}

export interface RuntimeIncidentEscalationState {
  level?: string;
  status?: string;
  dueAt?: string | null;
  escalateAt?: string | null;
  escalatedAt?: string | null;
  breachedAt?: string | null;
  summary?: string;
}

export interface RuntimeIncidentVerificationState {
  required?: boolean;
  agentId?: string | null;
  status?: string;
  summary?: string;
  verificationTaskId?: string | null;
  verificationRunId?: string | null;
  verifiedAt?: string | null;
}

export interface RuntimeIncidentLedgerRecord {
  incidentId?: string;
  title?: string;
  classification?: string;
  severity?: string;
  status?: string;
  truthLayer?: string;
  lastSeenAt?: string | null;
  firstSeenAt?: string | null;
  owner?: string | null;
  summary?: string;
  policy?: {
    policyId?: string;
    preferredOwner?: string;
    autoAssignOwner?: boolean;
    autoRemediateOnCreate?: boolean;
    remediationTaskType?: string;
    verifierTaskType?: string | null;
    targetSlaMinutes?: number;
    escalationMinutes?: number;
  };
  escalation?: RuntimeIncidentEscalationState;
  remediation?: {
    owner?: string;
    status?: string;
    summary?: string;
    nextAction?: string;
    blockers?: string[];
  };
  remediationPlan?: RuntimeIncidentRemediationPlanStep[];
  verification?: RuntimeIncidentVerificationState;
  remediationTasks?: RuntimeIncidentRemediationTask[];
}

export interface RuntimeDeliveryRecord {
  idempotencyKey?: string;
  status?: string;
  lastAttemptAt?: string | null;
  lastError?: string;
  sourceTaskId?: string;
  sourceRunId?: string;
}

export interface RuntimeWorkflowEvent {
  eventId?: string;
  stage?: string;
  type?: string;
  state?: string;
  timestamp?: string | null;
  source?: string;
  taskId?: string | null;
  runId?: string | null;
  parentEventId?: string | null;
  relatedRunId?: string | null;
  dependencyRunIds?: string[];
  toolId?: string | null;
  proofTransport?: "milestone" | "demandSummary" | null;
  classification?: string | null;
  stopCode?: string | null;
}

export interface RuntimeRelationshipObservation {
  observationId?: string;
  timestamp?: string | null;
  from?: string;
  to?: string;
  relationship?: string;
  status?: string;
  source?: string;
  taskId?: string | null;
  runId?: string | null;
  targetTaskId?: string | null;
  targetRunId?: string | null;
  toolId?: string | null;
  proofTransport?: "milestone" | "demandSummary" | null;
  classification?: string | null;
  parentObservationId?: string | null;
}

export interface RuntimeProofState {
  milestoneDeliveries?: RuntimeDeliveryRecord[];
  demandSummaryDeliveries?: RuntimeDeliveryRecord[];
}

export interface RuntimeStateSubset extends RuntimeProofState {
  updatedAt?: string | null;
  lastStartedAt?: string | null;
  taskExecutions?: RuntimeTaskExecution[];
  approvals?: RuntimeApprovalRecord[];
  repairRecords?: RuntimeRepairRecord[];
  taskRetryRecoveries?: Array<{ idempotencyKey?: string; retryAt?: string | null }>;
  incidentLedger?: RuntimeIncidentLedgerRecord[];
  workflowEvents?: RuntimeWorkflowEvent[];
  relationshipObservations?: RuntimeRelationshipObservation[];
}

export async function readJsonFile<T>(targetPath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(targetPath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function loadRuntimeState<T extends RuntimeStateSubset>(
  agentConfigPath: string,
  orchestratorStatePath: string | undefined,
): Promise<T> {
  if (!orchestratorStatePath) {
    return {} as T;
  }

  const resolvedPath = resolve(dirname(agentConfigPath), orchestratorStatePath);
  return readJsonFile<T>(resolvedPath, {} as T);
}

export function sortIsoDescending(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort((left, right) => Date.parse(right) - Date.parse(left));
}

export function countByStatus<T extends { status?: string }>(
  values: T[],
): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    const status = typeof value.status === "string" ? value.status : "unknown";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
}

export function summarizeProofTransport(records: RuntimeDeliveryRecord[]) {
  return {
    pending: records.filter((record) => record.status === "pending").length,
    retrying: records.filter((record) => record.status === "retrying").length,
    delivered: records.filter((record) => record.status === "delivered").length,
    deadLetter: records.filter((record) => record.status === "dead-letter").length,
    rejected: records.filter((record) => record.status === "rejected").length,
    lastAttemptAt:
      sortIsoDescending(records.map((record) => record.lastAttemptAt)).at(0) ?? null,
  };
}

export function summarizeTaskExecutions(
  executions: RuntimeTaskExecution[],
  taskTypes?: string[],
) {
  const filtered = taskTypes?.length
    ? executions.filter((entry) => taskTypes.includes(entry.type ?? ""))
    : executions;

  return {
    total: filtered.length,
    pending: filtered.filter((entry) => entry.status === "pending").length,
    running: filtered.filter((entry) => entry.status === "running").length,
    retrying: filtered.filter((entry) => entry.status === "retrying").length,
    failed: filtered.filter((entry) => entry.status === "failed").length,
    success: filtered.filter((entry) => entry.status === "success").length,
    lastHandledAt:
      sortIsoDescending(filtered.map((entry) => entry.lastHandledAt)).at(0) ?? null,
  };
}

export function summarizeRelationshipObservations(
  observations: RuntimeRelationshipObservation[],
) {
  const byRelationship = observations.reduce<Record<string, number>>((acc, observation) => {
    const relationship =
      typeof observation.relationship === "string"
        ? observation.relationship
        : "unknown";
    acc[relationship] = (acc[relationship] ?? 0) + 1;
    return acc;
  }, {});

  return {
    total: observations.length,
    lastObservedAt:
      sortIsoDescending(observations.map((observation) => observation.timestamp)).at(0) ??
      null,
    byRelationship,
  };
}

export function normalizeAgentIdFromNode(nodeId: string | undefined | null) {
  if (typeof nodeId !== "string" || nodeId.length === 0) return null;
  return nodeId.startsWith("agent:") ? nodeId.slice("agent:".length) : null;
}
