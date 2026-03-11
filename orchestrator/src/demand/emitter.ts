import { createHash, createHmac, randomBytes } from "node:crypto";
import { appendWorkflowEventRecord } from "../state.js";
import type {
  DemandSummaryDeliveryRecord,
  OrchestratorConfig,
  OrchestratorState,
  WorkflowEventRecord,
} from "../types.js";
import { buildDemandSummarySnapshot } from "./summary-builder.js";
import { getMilestoneEmitter } from "../milestones/emitter.js";

const MAX_DELIVERY_ATTEMPTS = 3;
type ProofWorkflowContext = {
  sourceTaskId?: string;
  sourceRunId?: string;
  actor?: string | null;
};

function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as object).sort()) {
      sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

function signEnvelope(payload: unknown, secret: string): string {
  return createHmac("sha256", secret)
    .update(JSON.stringify(sortObjectKeys(payload)))
    .digest("hex");
}

function buildProofWorkflowEventId(
  recordId: string,
  state: string,
  attempt: number,
  timestamp: string,
) {
  const digest = createHash("sha1")
    .update(["demandSummary", recordId, state, String(attempt), timestamp].join("|"))
    .digest("hex")
    .slice(0, 12);
  return `workflow:proof:demandSummary:${digest}`;
}

function appendProofWorkflowEvent(args: {
  state: OrchestratorState;
  recordId: string;
  runId?: string;
  taskId?: string;
  actor?: string | null;
  stateLabel: string;
  detail: string;
  attempt: number;
  timestamp: string;
  evidence?: string[];
}) {
  if (!args.runId || !args.taskId) {
    return;
  }

  const event: WorkflowEventRecord = {
    eventId: buildProofWorkflowEventId(
      args.recordId,
      args.stateLabel,
      args.attempt,
      args.timestamp,
    ),
    runId: args.runId,
    taskId: args.taskId,
    type: "proof.demandSummary",
    stage: "proof",
    state: args.stateLabel,
    timestamp: args.timestamp,
    source: "demandSummary-emitter",
    actor:
      typeof args.actor === "string" && args.actor.trim().length > 0
        ? args.actor.trim()
        : "system",
    nodeId: `proof:demandSummary:${args.recordId}`,
    detail: args.detail,
    evidence: [...new Set((args.evidence ?? []).filter(Boolean))].slice(0, 8),
  };

  const existing = args.state.workflowEvents.find(
    (record) => record.eventId === event.eventId,
  );
  if (!existing) {
    appendWorkflowEventRecord(args.state, event);
  }
}

export class DemandSummaryEmitter {
  constructor(
    private config: OrchestratorConfig,
    private getState: () => OrchestratorState,
    private persistState: () => Promise<void>,
  ) {}

  async emit(context: ProofWorkflowContext = {}): Promise<void> {
    const now = new Date().toISOString();
    const snapshot = buildDemandSummarySnapshot(this.getState(), now);
    const idempotencyKey = randomBytes(16).toString("hex");
    const topSegment = snapshot.segments.find((segment) => segment.liveSignalCount > 0);
    const reviewPressure =
      snapshot.queueTotal >= 8 || snapshot.tagCounts.manualReview > 0;

    if (
      this.config.demandSummaryIngestUrl &&
      !process.env.MILESTONE_SIGNING_SECRET
    ) {
      console.warn(
        "[demand-summary]",
        "demandSummaryIngestUrl is set but MILESTONE_SIGNING_SECRET env var is missing — deliveries will not be sent.",
      );
    }

    const record: DemandSummaryDeliveryRecord = {
      idempotencyKey,
      summaryId: snapshot.summaryId,
      sentAtUtc: now,
      snapshot,
      sourceTaskId: context.sourceTaskId,
      sourceRunId: context.sourceRunId,
      status: "pending",
      attempts: 0,
    };

    const state = this.getState();
    state.demandSummaryDeliveries.push(record);
    appendProofWorkflowEvent({
      state,
      recordId: record.idempotencyKey,
      runId: context.sourceRunId,
      taskId: context.sourceTaskId,
      actor: context.actor,
      stateLabel: "queued",
      detail: `Demand summary proof delivery queued for ${snapshot.summaryId}.`,
      attempt: 0,
      timestamp: now,
      evidence: [
        `summary:${snapshot.summaryId}`,
        `target:${this.config.demandSummaryIngestUrl ?? "unconfigured"}`,
      ],
    });
    await this.persistState();

    getMilestoneEmitter()?.emit({
      milestoneId: `demand.summary.${snapshot.summaryId}`,
      timestampUtc: now,
      scope: "demand",
      claim:
        snapshot.queueTotal > 0 || snapshot.draftTotal > 0
          ? `Demand telemetry refreshed: ${snapshot.queueTotal} queued lead${snapshot.queueTotal === 1 ? "" : "s"}, ${snapshot.draftTotal} draft${snapshot.draftTotal === 1 ? "" : "s"}.`
          : "Demand telemetry refreshed: queue is clear and no drafts are pending.",
      evidence: [
        {
          type: "metric",
          path: this.config.stateFile,
          summary: `queue=${snapshot.queueTotal}, drafts=${snapshot.draftTotal}, selected=${snapshot.selectedForDraftTotal}`,
        },
      ],
      riskStatus: reviewPressure ? "at-risk" : "on-track",
      nextAction:
        topSegment && snapshot.queueTotal > 0
          ? `Review the ${topSegment.label} lane and drain queued leads.`
          : "Keep the demand layer warm and watch for the next scored lead.",
      source: "orchestrator",
    }, context);

    this.deliverPending().catch((err) => {
      console.warn(
        "[demand-summary] background delivery failed:",
        (err as Error).message,
      );
    });
  }

  async deliverPending(): Promise<void> {
    const ingestUrl = this.config.demandSummaryIngestUrl;
    if (!ingestUrl) return;

    const secret = process.env.MILESTONE_SIGNING_SECRET;
    if (!secret) return;

    const state = this.getState();
    const pending = state.demandSummaryDeliveries.filter(
      (record) => record.status === "pending" || record.status === "retrying",
    );
    if (pending.length === 0) return;

    let changed = false;

    for (const record of pending) {
      const envelope = {
        idempotencyKey: record.idempotencyKey,
        sentAtUtc: record.sentAtUtc,
        snapshot: record.snapshot,
      };
      const timestamp = new Date().toISOString();
      const signature = signEnvelope(envelope, secret);
      appendProofWorkflowEvent({
        state,
        recordId: record.idempotencyKey,
        runId: record.sourceRunId,
        taskId: record.sourceTaskId,
        stateLabel: "attempted",
        detail: `Demand summary delivery attempt ${record.attempts + 1} started for ${record.summaryId}.`,
        attempt: record.attempts + 1,
        timestamp,
        evidence: [
          `summary:${record.summaryId}`,
          `target:${ingestUrl}`,
        ],
      });

      try {
        const response = await fetch(ingestUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-openclaw-signature": signature,
            "x-openclaw-timestamp": timestamp,
          },
          body: JSON.stringify(envelope),
          signal: AbortSignal.timeout(10_000),
        });

        record.lastAttemptAt = timestamp;
        record.attempts += 1;

        if (response.ok) {
          const body = (await response.json()) as { status?: string };
          record.status =
            body.status === "duplicate" ? "duplicate" : "delivered";
          state.lastDemandSummaryDeliveryAt = timestamp;
          appendProofWorkflowEvent({
            state,
            recordId: record.idempotencyKey,
            runId: record.sourceRunId,
            taskId: record.sourceTaskId,
            stateLabel: record.status,
            detail: `Demand summary delivery ${record.status} for ${record.summaryId}.`,
            attempt: record.attempts,
            timestamp,
            evidence: [
              `summary:${record.summaryId}`,
              `http:${response.status}`,
            ],
          });
          changed = true;
        } else if (response.status >= 400 && response.status < 500) {
          const body = await response.text().catch(() => "");
          record.status = "rejected";
          record.lastError = `HTTP ${response.status}: ${body.slice(0, 200)}`;
          appendProofWorkflowEvent({
            state,
            recordId: record.idempotencyKey,
            runId: record.sourceRunId,
            taskId: record.sourceTaskId,
            stateLabel: "rejected",
            detail: `Demand summary delivery rejected for ${record.summaryId}.`,
            attempt: record.attempts,
            timestamp,
            evidence: [
              `summary:${record.summaryId}`,
              `http:${response.status}`,
              record.lastError,
            ],
          });
          changed = true;
        } else {
          record.lastError = `HTTP ${response.status}`;
          record.status =
            record.attempts >= MAX_DELIVERY_ATTEMPTS
              ? "dead-letter"
              : "retrying";
          appendProofWorkflowEvent({
            state,
            recordId: record.idempotencyKey,
            runId: record.sourceRunId,
            taskId: record.sourceTaskId,
            stateLabel: record.status,
            detail:
              record.status === "dead-letter"
                ? `Demand summary delivery exhausted retries for ${record.summaryId}.`
                : `Demand summary delivery degraded for ${record.summaryId}; retry scheduled.`,
            attempt: record.attempts,
            timestamp,
            evidence: [
              `summary:${record.summaryId}`,
              `http:${response.status}`,
            ],
          });
          changed = true;
        }
      } catch (error) {
        record.lastAttemptAt = timestamp;
        record.attempts += 1;
        record.lastError = (error as Error).message;
        record.status =
          record.attempts >= MAX_DELIVERY_ATTEMPTS ? "dead-letter" : "retrying";
        appendProofWorkflowEvent({
          state,
          recordId: record.idempotencyKey,
          runId: record.sourceRunId,
          taskId: record.sourceTaskId,
          stateLabel: record.status,
          detail:
            record.status === "dead-letter"
              ? `Demand summary delivery exhausted retries for ${record.summaryId}.`
              : `Demand summary delivery degraded for ${record.summaryId}; retry scheduled.`,
          attempt: record.attempts,
          timestamp,
          evidence: [
            `summary:${record.summaryId}`,
            record.lastError,
          ],
        });
        changed = true;
      }
    }

    if (changed) {
      await this.persistState();
    }
  }
}

let _emitter: DemandSummaryEmitter | null = null;

export function initDemandSummaryEmitter(
  config: OrchestratorConfig,
  getState: () => OrchestratorState,
  persistState: () => Promise<void>,
): DemandSummaryEmitter {
  _emitter = new DemandSummaryEmitter(config, getState, persistState);
  return _emitter;
}

export function getDemandSummaryEmitter(): DemandSummaryEmitter | null {
  return _emitter;
}
