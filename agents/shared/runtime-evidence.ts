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
  affectedSurfaces?: string[];
  linkedServiceIds?: string[];
  recommendedSteps?: string[];
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

export interface IncidentPriorityRecord {
  incidentId: string;
  classification: string | null;
  severity: string;
  status: string;
  owner: string | null;
  recommendedOwner: string | null;
  escalationLevel: string | null;
  verificationStatus: string | null;
  priorityScore: number;
  summary: string;
  nextAction: string;
  blockers: string[];
  remediationTaskType: string | null;
  affectedSurfaces: string[];
  linkedServiceIds: string[];
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

export interface WorkflowBlockerSummary {
  totalStopSignals: number;
  latestStopAt: string | null;
  latestStopCode: string | null;
  byStage: Record<string, number>;
  byClassification: Record<string, number>;
  byStopCode: Record<string, number>;
  blockedRunIds: string[];
  proofStopSignals: number;
}

export interface AgentRelationshipWindow {
  agentId: string;
  total: number;
  recentSixHours: number;
  recentTwentyFourHours: number;
  lastObservedAt: string | null;
  byRelationship: Record<string, number>;
  recentEdges: Array<{
    from: string;
    to: string;
    relationship: string;
    timestamp: string | null;
    source: string | null;
  }>;
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

function severityRank(severity: string | undefined | null) {
  switch ((severity ?? "").toLowerCase()) {
    case "critical":
      return 40;
    case "warning":
      return 20;
    case "info":
      return 10;
    default:
      return 5;
  }
}

function escalationRank(level: string | undefined | null) {
  switch ((level ?? "").toLowerCase()) {
    case "breached":
      return 30;
    case "escalated":
      return 20;
    case "warning":
      return 10;
    default:
      return 0;
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)),
  );
}

export function buildIncidentPriorityQueue(
  incidents: RuntimeIncidentLedgerRecord[],
): IncidentPriorityRecord[] {
  return incidents
    .filter((incident) => incident.status !== "resolved")
    .map((incident) => {
      const severity = typeof incident.severity === "string" ? incident.severity : "warning";
      const escalationLevel =
        typeof incident.escalation?.level === "string" ? incident.escalation.level : null;
      const owner = typeof incident.owner === "string" && incident.owner.length > 0 ? incident.owner : null;
      const recommendedOwner =
        typeof incident.policy?.preferredOwner === "string" && incident.policy.preferredOwner.length > 0
          ? incident.policy.preferredOwner
          : owner;
      const blockers = uniqueStrings([
        ...(Array.isArray(incident.remediation?.blockers) ? incident.remediation?.blockers : []),
        ...((incident.remediationTasks ?? [])
          .flatMap((task) => (Array.isArray(task.blockers) ? task.blockers : []))),
      ]);
      const summary =
        typeof incident.summary === "string" && incident.summary.length > 0
          ? incident.summary
          : `Open ${incident.classification ?? "runtime"} incident`;
      const nextAction =
        typeof incident.remediation?.nextAction === "string" && incident.remediation.nextAction.length > 0
          ? incident.remediation.nextAction
          : Array.isArray(incident.recommendedSteps) && incident.recommendedSteps.length > 0
            ? incident.recommendedSteps[0]
            : "Inspect incident evidence and drive remediation to closure.";

      let priorityScore = severityRank(severity) + escalationRank(escalationLevel);
      if (!owner) priorityScore += 8;
      if ((incident.remediationTasks ?? []).some((task) => task.status === "blocked" || task.status === "failed")) {
        priorityScore += 6;
      }
      if (blockers.length > 0) priorityScore += 4;

      return {
        incidentId: incident.incidentId ?? "unknown-incident",
        classification:
          typeof incident.classification === "string" ? incident.classification : null,
        severity,
        status: typeof incident.status === "string" ? incident.status : "active",
        owner,
        recommendedOwner,
        escalationLevel,
        verificationStatus:
          typeof incident.verification?.status === "string" ? incident.verification.status : null,
        priorityScore,
        summary,
        nextAction,
        blockers,
        remediationTaskType:
          typeof incident.policy?.remediationTaskType === "string"
            ? incident.policy.remediationTaskType
            : null,
        affectedSurfaces: uniqueStrings(
          Array.isArray(incident.affectedSurfaces) ? incident.affectedSurfaces : [],
        ),
        linkedServiceIds: uniqueStrings(
          Array.isArray(incident.linkedServiceIds) ? incident.linkedServiceIds : [],
        ),
      };
    })
    .sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }
      return left.incidentId.localeCompare(right.incidentId);
    });
}

export function buildWorkflowBlockerSummary(
  events: RuntimeWorkflowEvent[],
): WorkflowBlockerSummary {
  const stopEvents = events.filter(
    (event) =>
      event.state === "blocked" ||
      event.state === "failed" ||
      (typeof event.stopCode === "string" && event.stopCode.length > 0),
  );

  const byStage = stopEvents.reduce<Record<string, number>>((acc, event) => {
    const stage = typeof event.stage === "string" ? event.stage : "unknown";
    acc[stage] = (acc[stage] ?? 0) + 1;
    return acc;
  }, {});

  const byClassification = stopEvents.reduce<Record<string, number>>((acc, event) => {
    const classification =
      typeof event.classification === "string" && event.classification.length > 0
        ? event.classification
        : "unspecified";
    acc[classification] = (acc[classification] ?? 0) + 1;
    return acc;
  }, {});

  const byStopCode = stopEvents.reduce<Record<string, number>>((acc, event) => {
    const stopCode =
      typeof event.stopCode === "string" && event.stopCode.length > 0
        ? event.stopCode
        : "unspecified";
    acc[stopCode] = (acc[stopCode] ?? 0) + 1;
    return acc;
  }, {});

  const latestStopAt =
    sortIsoDescending(stopEvents.map((event) => event.timestamp)).at(0) ?? null;
  const latestStopCode =
    stopEvents
      .slice()
      .sort(
        (left, right) =>
          Date.parse(right.timestamp ?? "1970-01-01T00:00:00.000Z") -
          Date.parse(left.timestamp ?? "1970-01-01T00:00:00.000Z"),
      )
      .map((event) => event.stopCode)
      .find((value): value is string => typeof value === "string" && value.length > 0) ??
    null;

  return {
    totalStopSignals: stopEvents.length,
    latestStopAt,
    latestStopCode,
    byStage,
    byClassification,
    byStopCode,
    blockedRunIds: uniqueStrings(
      stopEvents.flatMap((event) => [event.runId, event.relatedRunId]),
    ),
    proofStopSignals: stopEvents.filter((event) => event.stage === "proof").length,
  };
}

export function buildAgentRelationshipWindow(
  observations: RuntimeRelationshipObservation[],
  agentId: string,
): AgentRelationshipWindow {
  const now = Date.now();
  const sixHoursMs = 6 * 60 * 60 * 1000;
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  const relevant = observations.filter((observation) => {
    const fromAgent = normalizeAgentIdFromNode(observation.from ?? null);
    const toAgent = normalizeAgentIdFromNode(observation.to ?? null);
    return fromAgent === agentId || toAgent === agentId;
  });

  const recentEdges = relevant
    .slice()
    .sort(
      (left, right) =>
        Date.parse(right.timestamp ?? "1970-01-01T00:00:00.000Z") -
        Date.parse(left.timestamp ?? "1970-01-01T00:00:00.000Z"),
    )
    .slice(0, 8)
    .map((observation) => ({
      from: observation.from ?? "unknown",
      to: observation.to ?? "unknown",
      relationship: observation.relationship ?? "unknown",
      timestamp: observation.timestamp ?? null,
      source: observation.source ?? null,
    }));

  const byRelationship = relevant.reduce<Record<string, number>>((acc, observation) => {
    const relationship =
      typeof observation.relationship === "string" ? observation.relationship : "unknown";
    acc[relationship] = (acc[relationship] ?? 0) + 1;
    return acc;
  }, {});

  return {
    agentId,
    total: relevant.length,
    recentSixHours: relevant.filter((observation) => {
      const timestamp = Date.parse(observation.timestamp ?? "");
      return Number.isFinite(timestamp) && now - timestamp <= sixHoursMs;
    }).length,
    recentTwentyFourHours: relevant.filter((observation) => {
      const timestamp = Date.parse(observation.timestamp ?? "");
      return Number.isFinite(timestamp) && now - timestamp <= twentyFourHoursMs;
    }).length,
    lastObservedAt:
      sortIsoDescending(relevant.map((observation) => observation.timestamp)).at(0) ?? null,
    byRelationship,
    recentEdges,
  };
}
