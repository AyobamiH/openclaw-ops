import { createHash, createHmac, randomBytes } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MilestoneEventSchema, type MilestoneEvent } from './schema.js';
import { publishToFeed } from './feed-publisher.js';
import {
  appendRelationshipObservationRecord,
  appendWorkflowEventRecord,
} from "../state.js";
import type {
  MilestoneDeliveryRecord,
  OrchestratorConfig,
  OrchestratorState,
  RelationshipObservationStatus,
  WorkflowEventRecord,
} from "../types.js";

const MAX_DELIVERY_ATTEMPTS = 3;
type ProofWorkflowContext = {
  sourceTaskId?: string;
  sourceRunId?: string;
  actor?: string | null;
};

function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj as object).sort()) {
      sorted[k] = sortObjectKeys((obj as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return obj;
}

function signEnvelope(payload: unknown, secret: string): string {
  return createHmac('sha256', secret)
    .update(JSON.stringify(sortObjectKeys(payload)))
    .digest('hex');
}

function buildProofWorkflowEventId(
  transport: "milestone" | "demandSummary",
  recordId: string,
  state: string,
  attempt: number,
  timestamp: string,
) {
  const digest = createHash("sha1")
    .update([transport, recordId, state, String(attempt), timestamp].join("|"))
    .digest("hex")
    .slice(0, 12);
  return `workflow:proof:${transport}:${digest}`;
}

function appendProofWorkflowEvent(args: {
  state: OrchestratorState;
  transport: "milestone" | "demandSummary";
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
      args.transport,
      args.recordId,
      args.stateLabel,
      args.attempt,
      args.timestamp,
    ),
    runId: args.runId,
    taskId: args.taskId,
    type: `proof.${args.transport}`,
    stage: "proof",
    state: args.stateLabel,
    timestamp: args.timestamp,
    source: `${args.transport}-emitter`,
    actor:
      typeof args.actor === "string" && args.actor.trim().length > 0
        ? args.actor.trim()
        : "system",
    nodeId: `proof:${args.transport}:${args.recordId}`,
    detail: args.detail,
    evidence: [...new Set((args.evidence ?? []).filter(Boolean))].slice(0, 8),
    attempt: args.attempt,
    stopCode: null,
  };

  const existing = args.state.workflowEvents.find(
    (record) => record.eventId === event.eventId,
  );
  if (!existing) {
    appendWorkflowEventRecord(args.state, event);
  }
}

function appendProofRelationshipObservation(args: {
  state: OrchestratorState;
  recordId: string;
  taskId?: string;
  runId?: string;
  source: string;
  timestamp: string;
  detail: string;
  status: RelationshipObservationStatus;
  evidence?: string[];
}) {
  appendRelationshipObservationRecord(args.state, {
    observationId: `relationship:proof:milestone:${args.recordId}:${args.timestamp}`,
    timestamp: args.timestamp,
    from: "surface:orchestrator",
    to: "surface:openclawdbot",
    relationship: "publishes-proof",
    status: args.status,
    source: args.source,
    detail: args.detail,
    taskId: args.taskId ?? null,
    runId: args.runId ?? null,
    evidence: [...new Set((args.evidence ?? []).filter(Boolean))].slice(0, 12),
  });
}

export class MilestoneEmitter {
  constructor(
    private config: OrchestratorConfig,
    private getState: () => OrchestratorState,
    private persistState: () => Promise<void>,
  ) {}

  /** Validate, log, and queue a milestone event for delivery. */
  async emit(event: MilestoneEvent, context: ProofWorkflowContext = {}): Promise<void> {
    const parsed = MilestoneEventSchema.safeParse(event);
    if (!parsed.success) {
      console.warn('[milestones] emit: invalid event schema:', parsed.error.message);
      return;
    }

    const now = new Date().toISOString();
    const idempotencyKey = randomBytes(16).toString('hex');

    // Warn loudly if delivery is half-configured — this is an ops error, not a runtime toggle.
    if (this.config.milestoneIngestUrl && !process.env.MILESTONE_SIGNING_SECRET) {
      console.warn('[milestones]', 'milestoneIngestUrl is set but MILESTONE_SIGNING_SECRET env var is missing — deliveries will not be sent.');
    }

    await this.appendLog(parsed.data, now);

    // Publish to the JSON feed file (and optionally git-push) if configured
    const feedPath = this.config.milestoneFeedPath;
    const secret = process.env.MILESTONE_SIGNING_SECRET;
    if (feedPath && secret) {
      publishToFeed({
        idempotencyKey,
        sentAtUtc: now,
        event: parsed.data,
        feedPath,
        secret,
        gitPush: this.config.gitPushOnMilestone === true,
        workspaceRoot: join(this.config.logsDir, '..'),
      }).catch((err) => {
        console.warn('[milestones] feed publish failed:', (err as Error).message);
      });
    }

    const record: MilestoneDeliveryRecord = {
      idempotencyKey,
      milestoneId: parsed.data.milestoneId,
      sentAtUtc: now,
      event: parsed.data,
      sourceTaskId: context.sourceTaskId,
      sourceRunId: context.sourceRunId,
      status: 'pending',
      attempts: 0,
    };

    const state = this.getState();
    state.milestoneDeliveries.push(record);
    appendProofWorkflowEvent({
      state,
      transport: "milestone",
      recordId: record.idempotencyKey,
      runId: context.sourceRunId,
      taskId: context.sourceTaskId,
      actor: context.actor,
      stateLabel: "queued",
      detail: `Milestone proof delivery queued for ${parsed.data.milestoneId}.`,
      attempt: 0,
      timestamp: now,
      evidence: [
        `milestone:${parsed.data.milestoneId}`,
        `scope:${parsed.data.scope}`,
        `target:${this.config.milestoneIngestUrl ?? "unconfigured"}`,
      ],
    });
    appendProofRelationshipObservation({
      state,
      recordId: record.idempotencyKey,
      taskId: context.sourceTaskId,
      runId: context.sourceRunId,
      source: "milestone-emitter",
      timestamp: now,
      status: "observed",
      detail: `Milestone proof delivery queued for ${parsed.data.milestoneId}.`,
      evidence: [
        `milestone:${parsed.data.milestoneId}`,
        `target:${this.config.milestoneIngestUrl ?? "unconfigured"}`,
      ],
    });
    await this.persistState();

    // Attempt immediate delivery; errors are non-fatal
    this.deliverPending().catch((err) => {
      console.warn('[milestones] background delivery failed:', (err as Error).message);
    });
  }

  /** Deliver all pending/retrying records to the configured ingest URL. */
  async deliverPending(): Promise<void> {
    const ingestUrl = this.config.milestoneIngestUrl;
    if (!ingestUrl) return;

    const secret = process.env.MILESTONE_SIGNING_SECRET;
    if (!secret) return;

    const state = this.getState();
    const pending = state.milestoneDeliveries.filter(
      (r) => r.status === 'pending' || r.status === 'retrying',
    );
    if (pending.length === 0) return;

    let changed = false;

    for (const record of pending) {
      const envelope = {
        idempotencyKey: record.idempotencyKey,
        sentAtUtc: record.sentAtUtc,
        event: record.event,
      };
      const timestamp = new Date().toISOString();
      const sig = signEnvelope(envelope, secret);
      appendProofWorkflowEvent({
        state,
        transport: "milestone",
        recordId: record.idempotencyKey,
        runId: record.sourceRunId,
        taskId: record.sourceTaskId,
        stateLabel: "attempted",
        detail: `Milestone delivery attempt ${record.attempts + 1} started for ${record.milestoneId}.`,
        attempt: record.attempts + 1,
        timestamp,
        evidence: [
          `milestone:${record.milestoneId}`,
          `target:${ingestUrl}`,
        ],
      });
      appendProofRelationshipObservation({
        state,
        recordId: record.idempotencyKey,
        taskId: record.sourceTaskId,
        runId: record.sourceRunId,
        source: "milestone-emitter",
        timestamp,
        status: "observed",
        detail: `Milestone proof delivery attempt ${record.attempts + 1} started for ${record.milestoneId}.`,
        evidence: [`milestone:${record.milestoneId}`, `target:${ingestUrl}`],
      });

      try {
        console.log(
          `[milestones] deliver attempt milestoneId=${record.milestoneId} url=${ingestUrl}`,
        );
        const res = await fetch(ingestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-openclaw-signature': sig,
            'x-openclaw-timestamp': timestamp,
          },
          body: JSON.stringify(envelope),
          signal: AbortSignal.timeout(10_000),
        });

        record.lastAttemptAt = timestamp;
        record.attempts += 1;

        if (res.ok) {
          const body = (await res.json()) as { status?: string };
          record.status = body.status === 'duplicate' ? 'duplicate' : 'delivered';
          state.lastMilestoneDeliveryAt = timestamp;
          appendProofWorkflowEvent({
            state,
            transport: "milestone",
            recordId: record.idempotencyKey,
            runId: record.sourceRunId,
            taskId: record.sourceTaskId,
            stateLabel: record.status,
            detail: `Milestone delivery ${record.status} for ${record.milestoneId}.`,
            attempt: record.attempts,
            timestamp,
            evidence: [
              `milestone:${record.milestoneId}`,
              `http:${res.status}`,
            ],
          });
          appendProofRelationshipObservation({
            state,
            recordId: record.idempotencyKey,
            taskId: record.sourceTaskId,
            runId: record.sourceRunId,
            source: "milestone-emitter",
            timestamp,
            status: "observed",
            detail: `Milestone proof delivery ${record.status} for ${record.milestoneId}.`,
            evidence: [`milestone:${record.milestoneId}`, `http:${res.status}`],
          });
          console.log(
            `[milestones] deliver success milestoneId=${record.milestoneId} status=${record.status} http=${res.status}`,
          );
          changed = true;
        } else if (res.status >= 400 && res.status < 500) {
          const body = await res.text().catch(() => '');
          record.status = 'rejected';
          record.lastError = `HTTP ${res.status}: ${body.slice(0, 200)}`;
          appendProofWorkflowEvent({
            state,
            transport: "milestone",
            recordId: record.idempotencyKey,
            runId: record.sourceRunId,
            taskId: record.sourceTaskId,
            stateLabel: "rejected",
            detail: `Milestone delivery rejected for ${record.milestoneId}.`,
            attempt: record.attempts,
            timestamp,
            evidence: [
              `milestone:${record.milestoneId}`,
              `http:${res.status}`,
              record.lastError,
            ],
          });
          appendProofRelationshipObservation({
            state,
            recordId: record.idempotencyKey,
            taskId: record.sourceTaskId,
            runId: record.sourceRunId,
            source: "milestone-emitter",
            timestamp,
            status: "degraded",
            detail: `Milestone proof delivery rejected for ${record.milestoneId}.`,
            evidence: [
              `milestone:${record.milestoneId}`,
              `http:${res.status}`,
              record.lastError,
            ],
          });
          console.warn(
            `[milestones] deliver rejected milestoneId=${record.milestoneId} http=${res.status}`,
          );
          changed = true;
        } else {
          record.lastError = `HTTP ${res.status}`;
          record.status = record.attempts >= MAX_DELIVERY_ATTEMPTS ? 'dead-letter' : 'retrying';
          appendProofWorkflowEvent({
            state,
            transport: "milestone",
            recordId: record.idempotencyKey,
            runId: record.sourceRunId,
            taskId: record.sourceTaskId,
            stateLabel: record.status,
            detail:
              record.status === "dead-letter"
                ? `Milestone delivery exhausted retries for ${record.milestoneId}.`
                : `Milestone delivery degraded for ${record.milestoneId}; retry scheduled.`,
            attempt: record.attempts,
            timestamp,
            evidence: [
              `milestone:${record.milestoneId}`,
              `http:${res.status}`,
            ],
          });
          appendProofRelationshipObservation({
            state,
            recordId: record.idempotencyKey,
            taskId: record.sourceTaskId,
            runId: record.sourceRunId,
            source: "milestone-emitter",
            timestamp,
            status: record.status === "dead-letter" ? "degraded" : "warning",
            detail:
              record.status === "dead-letter"
                ? `Milestone delivery exhausted retries for ${record.milestoneId}.`
                : `Milestone delivery degraded for ${record.milestoneId}; retry scheduled.`,
            evidence: [`milestone:${record.milestoneId}`, `http:${res.status}`],
          });
          console.warn(
            `[milestones] deliver retry milestoneId=${record.milestoneId} http=${res.status} attempts=${record.attempts}`,
          );
          changed = true;
        }
      } catch (err) {
        record.lastAttemptAt = timestamp;
        record.attempts += 1;
        record.lastError = (err as Error).message;
        record.status = record.attempts >= MAX_DELIVERY_ATTEMPTS ? 'dead-letter' : 'retrying';
        appendProofWorkflowEvent({
          state,
          transport: "milestone",
          recordId: record.idempotencyKey,
          runId: record.sourceRunId,
          taskId: record.sourceTaskId,
          stateLabel: record.status,
          detail:
            record.status === "dead-letter"
              ? `Milestone delivery exhausted retries for ${record.milestoneId}.`
              : `Milestone delivery degraded for ${record.milestoneId}; retry scheduled.`,
          attempt: record.attempts,
          timestamp,
          evidence: [
            `milestone:${record.milestoneId}`,
            record.lastError,
          ],
        });
        appendProofRelationshipObservation({
          state,
          recordId: record.idempotencyKey,
          taskId: record.sourceTaskId,
          runId: record.sourceRunId,
          source: "milestone-emitter",
          timestamp,
          status: record.status === "dead-letter" ? "degraded" : "warning",
          detail:
            record.status === "dead-letter"
              ? `Milestone delivery exhausted retries for ${record.milestoneId}.`
              : `Milestone delivery degraded for ${record.milestoneId}; retry scheduled.`,
          evidence: [`milestone:${record.milestoneId}`, record.lastError],
        });
        console.warn(
          `[milestones] deliver error milestoneId=${record.milestoneId} attempts=${record.attempts} error=${(err as Error).message}`,
        );
        changed = true;
      }
    }

    if (changed) {
      await this.persistState();
    }
  }

  private async appendLog(event: MilestoneEvent, sentAtUtc: string): Promise<void> {
    try {
      const logPath = join(this.config.logsDir, 'milestones.jsonl');
      await mkdir(dirname(logPath), { recursive: true });
      await appendFile(logPath, JSON.stringify({ sentAtUtc, event }) + '\n', 'utf-8');
    } catch (err) {
      console.warn('[milestones] log append failed:', (err as Error).message);
    }
  }
}

let _emitter: MilestoneEmitter | null = null;

export function initMilestoneEmitter(
  config: OrchestratorConfig,
  getState: () => OrchestratorState,
  persistState: () => Promise<void>,
): MilestoneEmitter {
  _emitter = new MilestoneEmitter(config, getState, persistState);
  return _emitter;
}

export function getMilestoneEmitter(): MilestoneEmitter | null {
  return _emitter;
}
