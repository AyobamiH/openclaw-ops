import { createHmac, randomBytes } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MilestoneEventSchema, type MilestoneEvent } from './schema.js';
import { publishToFeed } from './feed-publisher.js';
import type { MilestoneDeliveryRecord, OrchestratorConfig, OrchestratorState } from '../types.js';

const MAX_DELIVERY_ATTEMPTS = 3;

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

export class MilestoneEmitter {
  constructor(
    private config: OrchestratorConfig,
    private getState: () => OrchestratorState,
    private persistState: () => Promise<void>,
  ) {}

  /** Validate, log, and queue a milestone event for delivery. */
  async emit(event: MilestoneEvent): Promise<void> {
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
        workspaceRoot: join(this.config.logsDir, '..', '..'),
      }).catch((err) => {
        console.warn('[milestones] feed publish failed:', (err as Error).message);
      });
    }

    const record: MilestoneDeliveryRecord = {
      idempotencyKey,
      milestoneId: parsed.data.milestoneId,
      sentAtUtc: now,
      event: parsed.data,
      status: 'pending',
      attempts: 0,
    };

    this.getState().milestoneDeliveries.push(record);
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

      try {
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
          changed = true;
        } else if (res.status >= 400 && res.status < 500) {
          const body = await res.text().catch(() => '');
          record.status = 'rejected';
          record.lastError = `HTTP ${res.status}: ${body.slice(0, 200)}`;
          changed = true;
        } else {
          record.lastError = `HTTP ${res.status}`;
          record.status = record.attempts >= MAX_DELIVERY_ATTEMPTS ? 'dead-letter' : 'retrying';
          changed = true;
        }
      } catch (err) {
        record.lastAttemptAt = timestamp;
        record.attempts += 1;
        record.lastError = (err as Error).message;
        record.status = record.attempts >= MAX_DELIVERY_ATTEMPTS ? 'dead-letter' : 'retrying';
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
