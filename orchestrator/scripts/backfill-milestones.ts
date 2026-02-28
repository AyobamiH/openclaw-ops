/**
 * Backfill historical startup milestones into the delivery queue.
 *
 * Reads orchestrator state, finds startup TaskRecords that have no
 * corresponding MilestoneDeliveryRecord, and emits them using the same
 * milestone shape as startupHandler.
 *
 * If milestoneIngestUrl is configured, delivery is attempted immediately.
 * If not, records are queued in state and will be delivered the next time
 * deliverPending() runs (on next orchestrator startup).
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
import type { TaskRecord } from '../src/types.js';

const startupMilestoneId = (handledAt: string) => `orchestrator.started.${handledAt}`;

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

  if (startups.length === 0) {
    console.log('[backfill] no startup records found in taskHistory — nothing to backfill');
    return;
  }

  let emitted = 0;
  for (const task of startups) {
    const milestoneId = startupMilestoneId(task.handledAt);
    if (existingIds.has(milestoneId)) {
      console.log(`[backfill] skip  ${milestoneId}  (already queued)`);
      continue;
    }
    await emitter.emit({
      milestoneId,
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
      nextAction: 'Monitor task queue for first incoming tasks.',
      source: 'orchestrator',
    });
    console.log(`[backfill] emit   ${milestoneId}`);
    emitted++;
  }

  console.log(
    `[backfill] ${emitted} new milestone(s) emitted, ${startups.length - emitted} skipped`,
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
