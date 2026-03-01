/**
 * Backfill historical milestones into the delivery queue.
 *
 * Reads orchestrator state and reconstructs milestone events for:
 * - startup
 * - rss-sweep
 * - nightly-batch
 * - reddit-response
 * - approvals
 * - legacy demand summary deliveries
 *
 * If milestoneIngestUrl is configured, delivery is attempted immediately.
 * If not, records are queued in state and will be delivered the next time
 * deliverPending() runs.
 *
 * Usage (inside Docker container):
 *   npm run milestones:backfill
 *
 * Usage (local dev, overriding Docker state path):
 *   STATE_FILE=/absolute/path/to/orchestrator-state.json npm run milestones:backfill
 */
import { loadConfig } from '../src/config.js';
import { loadState, saveStateWithOptions } from '../src/state.js';
import { initMilestoneEmitter } from '../src/milestones/emitter.js';
import type { ApprovalRecord, DemandSummaryDeliveryRecord, TaskRecord } from '../src/types.js';
import type { MilestoneEvent } from '../src/milestones/schema.js';

const startupMilestoneId = (handledAt: string) => `orchestrator.started.${handledAt}`;
const rssSweepMilestoneId = (handledAt: string) => `rss.sweep.${handledAt}`;
const nightlyBatchMilestoneId = (handledAt: string) => `nightly.batch.${handledAt}`;
const redditResponseMilestoneId = (handledAt: string) => `reddit.response.${handledAt}`;
const approvalRequestedMilestoneId = (taskId: string) => `approval.requested.${taskId}`;
const approvalDecisionMilestoneId = (
  taskId: string,
  status: ApprovalRecord['status'],
) => `approval.${status}.${taskId}`;
const demandSummaryMilestoneId = (summaryId: string) => `demand.summary.${summaryId}`;

async function main() {
  const config = await loadConfig();

  // Allow overriding the state file path for local dev (config bakes in Docker paths)
  const stateFile = process.env.STATE_FILE ?? config.stateFile;
  const state = await loadState(stateFile);

  const existingIds = new Set(state.milestoneDeliveries.map((r) => r.milestoneId));

  const emitter = initMilestoneEmitter(
    config,
    () => state,
    () => saveStateWithOptions(stateFile, state, {}),
  );

  const startups = state.taskHistory.filter(
    (t: TaskRecord) => t.type === 'startup' && t.result === 'ok',
  );

  let emitted = 0;

  const emitIfMissing = async (event: MilestoneEvent) => {
    if (existingIds.has(event.milestoneId)) {
      console.log(`[backfill] skip  ${event.milestoneId}  (already queued)`);
      return;
    }

    await emitter.emit(event);
    existingIds.add(event.milestoneId);
    console.log(`[backfill] emit   ${event.milestoneId}`);
    emitted++;
  };

  for (const task of startups) {
    await emitIfMissing({
      milestoneId: startupMilestoneId(task.handledAt),
      timestampUtc: task.handledAt,
      scope: 'runtime',
      claim: 'Orchestrator started successfully.',
      evidence: [
        {
          type: 'log',
          path: config.stateFile,
          summary: 'lastStartedAt set in orchestrator state',
        },
      ],
      riskStatus: 'on-track',
      nextAction: 'Watch the next scheduled automation pass for new work.',
      source: 'orchestrator',
    });
  }

  const rssSweeps = state.taskHistory.filter(
    (t: TaskRecord) =>
      t.type === 'rss-sweep' &&
      t.result === 'ok' &&
      typeof t.message === 'string' &&
      t.message.startsWith('rss sweep drafted '),
  );

  for (const task of rssSweeps) {
    const drafted = Number(task.message?.match(/rss sweep drafted (\d+) replies/)?.[1] ?? 0);
    await emitIfMissing({
      milestoneId: rssSweepMilestoneId(task.handledAt),
      timestampUtc: task.handledAt,
      scope: 'demand',
      claim: `RSS sweep surfaced ${drafted} new lead${drafted === 1 ? '' : 's'} for follow-up.`,
      evidence: [
        {
          type: 'log',
          path: config.redditDraftsPath ?? 'logs/reddit-drafts.jsonl',
          summary: `${drafted} draft record${drafted === 1 ? '' : 's'} appended during sweep`,
        },
      ],
      riskStatus: 'on-track',
      nextAction: 'Review priority leads and route them into reddit-response.',
      source: 'orchestrator',
    });
  }

  const nightlyBatches = state.taskHistory.filter(
    (t: TaskRecord) =>
      t.type === 'nightly-batch' &&
      t.result === 'ok' &&
      typeof t.message === 'string' &&
      t.message.startsWith('nightly batch:'),
  );

  for (const task of nightlyBatches) {
    const docsSynced = Number(
      task.message?.match(/synced (\d+) docs/)?.[1] ?? 0,
    );
    const marked = Number(
      task.message?.match(/marked (\d+) for draft/)?.[1] ?? 0,
    );
    await emitIfMissing({
      milestoneId: nightlyBatchMilestoneId(task.handledAt),
      timestampUtc: task.handledAt,
      scope: 'runtime',
      claim: `Nightly batch completed: ${docsSynced} doc(s) synced, ${marked} item(s) marked for draft.`,
      evidence: [
        {
          type: 'log',
          path: config.digestDir ?? 'logs/digests',
          summary: 'nightly digest compiled for the current queue',
        },
      ],
      riskStatus: 'on-track',
      nextAction: 'Process the marked queue items while the queue is still fresh.',
      source: 'orchestrator',
    });
  }

  const redditResponses = state.taskHistory.filter(
    (t: TaskRecord) =>
      t.type === 'reddit-response' &&
      t.result === 'ok' &&
      typeof t.message === 'string' &&
      t.message.startsWith('drafted reddit reply for '),
  );

  for (const task of redditResponses) {
    const subreddit =
      task.message?.match(/drafted reddit reply for ([^(]+)\s+\(/)?.[1]?.trim() ??
      'r/OpenClaw';
    await emitIfMissing({
      milestoneId: redditResponseMilestoneId(task.handledAt),
      timestampUtc: task.handledAt,
      scope: 'community',
      claim: `Reddit response drafted for ${subreddit}.`,
      evidence: [
        {
          type: 'log',
          path: config.stateFile,
          summary: 'reddit response recorded in orchestrator state',
        },
      ],
      riskStatus: 'on-track',
      nextAction: 'Review the draft and post it if the context is still current.',
      source: 'orchestrator',
    });
  }

  for (const approval of state.approvals) {
    await emitIfMissing({
      milestoneId: approvalRequestedMilestoneId(approval.taskId),
      timestampUtc: approval.requestedAt,
      scope: 'governance',
      claim: `Approval requested for ${approval.type}.`,
      evidence: [
        {
          type: 'log',
          path: config.stateFile,
          summary: 'approval request stored in orchestrator state',
        },
      ],
      riskStatus: 'at-risk',
      nextAction: 'Review the pending approval and either approve or reject the task.',
      source: 'orchestrator',
    });

    if (approval.status === 'approved' || approval.status === 'rejected') {
      await emitIfMissing({
        milestoneId: approvalDecisionMilestoneId(approval.taskId, approval.status),
        timestampUtc: approval.decidedAt ?? approval.requestedAt,
        scope: 'governance',
        claim:
          approval.status === 'approved'
            ? `Approval granted for ${approval.type}.`
            : `Approval rejected for ${approval.type}.`,
        evidence: [
          {
            type: 'log',
            path: config.stateFile,
            summary:
              approval.status === 'approved'
                ? 'approval marked approved and replay queued'
                : 'approval marked rejected in orchestrator state',
          },
        ],
        riskStatus: approval.status === 'approved' ? 'on-track' : 'blocked',
        nextAction:
          approval.status === 'approved'
            ? 'Monitor the replayed task for completion.'
            : 'Adjust the payload or note before retrying this task.',
        source: 'operator',
      });
    }
  }

  for (const delivery of state.demandSummaryDeliveries) {
    const record = delivery as DemandSummaryDeliveryRecord;
    const topSegment = record.snapshot.segments.find((segment) => segment.liveSignalCount > 0);
    await emitIfMissing({
      milestoneId: demandSummaryMilestoneId(record.summaryId),
      timestampUtc: record.sentAtUtc,
      scope: 'demand',
      claim:
        record.snapshot.queueTotal > 0 || record.snapshot.draftTotal > 0
          ? `Demand telemetry refreshed: ${record.snapshot.queueTotal} queued lead${record.snapshot.queueTotal === 1 ? '' : 's'}, ${record.snapshot.draftTotal} draft${record.snapshot.draftTotal === 1 ? '' : 's'}.`
          : 'Demand telemetry refreshed: queue is clear and no drafts are pending.',
      evidence: [
        {
          type: 'metric',
          path: config.stateFile,
          summary: `queue=${record.snapshot.queueTotal}, drafts=${record.snapshot.draftTotal}, selected=${record.snapshot.selectedForDraftTotal}`,
        },
      ],
      riskStatus:
        record.snapshot.queueTotal >= 8 || record.snapshot.tagCounts.manualReview > 0
          ? 'at-risk'
          : 'on-track',
      nextAction:
        topSegment && record.snapshot.queueTotal > 0
          ? `Review the ${topSegment.label} lane and drain queued leads.`
          : 'Keep the demand layer warm and watch for the next scored lead.',
      source: 'orchestrator',
    });
  }

  console.log(
    `[backfill] ${emitted} new milestone(s) emitted`,
  );

  if (config.milestoneIngestUrl) {
    console.log(`[backfill] delivering to ${config.milestoneIngestUrl} …`);
    await emitter.deliverPending();
    const delivered = state.milestoneDeliveries.filter((r) => r.status === 'delivered').length;
    const failed = state.milestoneDeliveries.filter(
      (r) => r.status === 'dead-letter' || r.status === 'rejected',
    ).length;
    console.log(`[backfill] delivery done — ${delivered} delivered, ${failed} failed`);
  } else {
    console.log(
      '[backfill] milestoneIngestUrl not set — records queued in state, will deliver automatically when URL is configured',
    );
  }
}

main().catch((err: unknown) => {
  console.error('[backfill] fatal:', (err as Error).message);
  process.exit(1);
});
