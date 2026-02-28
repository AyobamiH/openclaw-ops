import { Hono } from 'hono';
import { redis, realtime } from '@devvit/web/server';
import { SIGNING_SECRET_REDIS_KEY } from './forms';
import { createHmac } from 'node:crypto';
import type { MilestoneIngestEnvelope, MilestoneIngestResponse, MilestoneFeedResponse, MilestoneDeadLetterResponse, MilestoneRealtimeMessage } from '../../shared/milestones';

const FEED_KEY = 'milestones:feed';
const SEEN_KEY_PREFIX = 'milestone:seen:';
const REJECTED_KEY = 'milestones:rejected';
const MAX_FEED_ITEMS = 50;
const MAX_REJECTED_ITEMS = 100;

type RejectedEntry = { timestampUtc: string; reason: string; idempotencyKey?: string };

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

/** Constant-time string comparison to prevent timing attacks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** POST /internal/milestones/ingest — receives signed milestone envelopes from orchestrator. */
export const milestoneIngest = new Hono();

/** Append a rejection record to the bounded Redis dead-letter list (fire-and-forget). */
async function recordRejection(entry: RejectedEntry): Promise<void> {
  try {
    const raw = await redis.get(REJECTED_KEY);
    const list: RejectedEntry[] = raw ? (JSON.parse(raw) as RejectedEntry[]) : [];
    list.push(entry);
    if (list.length > MAX_REJECTED_ITEMS) list.splice(0, list.length - MAX_REJECTED_ITEMS);
    await redis.set(REJECTED_KEY, JSON.stringify(list));
  } catch {
    // Non-fatal — never block ingest on dead-letter write
  }
}

milestoneIngest.post('/ingest', async (c) => {
  const now = new Date().toISOString();
  const secret = await redis.get(SIGNING_SECRET_REDIS_KEY);
  if (!secret) {
    return c.json<MilestoneIngestResponse>(
      { ok: false, status: 'rejected', reason: 'server misconfigured: MILESTONE_SIGNING_SECRET not set' },
      500,
    );
  }

  const signature = c.req.header('x-openclaw-signature');
  const timestamp = c.req.header('x-openclaw-timestamp');
  if (!signature || !timestamp) {
    await recordRejection({ timestampUtc: now, reason: 'missing x-openclaw-signature or x-openclaw-timestamp' });
    return c.json<MilestoneIngestResponse>(
      { ok: false, status: 'rejected', reason: 'missing x-openclaw-signature or x-openclaw-timestamp' },
      401,
    );
  }

  let body: MilestoneIngestEnvelope;
  try {
    body = await c.req.json<MilestoneIngestEnvelope>();
  } catch {
    await recordRejection({ timestampUtc: now, reason: 'invalid JSON body' });
    return c.json<MilestoneIngestResponse>(
      { ok: false, status: 'rejected', reason: 'invalid JSON body' },
      400,
    );
  }

  const expected = signEnvelope(body, secret);
  if (!safeEqual(signature.toLowerCase(), expected.toLowerCase())) {
    await recordRejection({ timestampUtc: now, reason: 'invalid signature', idempotencyKey: body.idempotencyKey });
    return c.json<MilestoneIngestResponse>(
      { ok: false, status: 'rejected', reason: 'invalid signature' },
      401,
    );
  }

  // Idempotency check
  const seenKey = SEEN_KEY_PREFIX + body.idempotencyKey;
  const alreadySeen = await redis.get(seenKey);
  if (alreadySeen) {
    return c.json<MilestoneIngestResponse>(
      { ok: true, status: 'duplicate', milestoneId: body.event.milestoneId },
      200,
    );
  }

  // Append to feed (bounded circular buffer in Redis)
  const feedStr = await redis.get(FEED_KEY);
  const feed: MilestoneIngestEnvelope['event'][] = feedStr ? (JSON.parse(feedStr) as MilestoneIngestEnvelope['event'][]) : [];
  feed.push(body.event);
  if (feed.length > MAX_FEED_ITEMS) {
    feed.splice(0, feed.length - MAX_FEED_ITEMS);
  }
  await redis.set(FEED_KEY, JSON.stringify(feed));
  await redis.set(seenKey, '1');

  // Broadcast to any connected clients for live updates
  await realtime.send<MilestoneRealtimeMessage>('milestones-feed', { event: body.event });

  return c.json<MilestoneIngestResponse>(
    { ok: true, status: 'accepted', milestoneId: body.event.milestoneId },
    200,
  );
});

/** GET /api/milestones/latest — returns the current milestone feed. */
export const milestoneFeed = new Hono();

milestoneFeed.get('/latest', async (c) => {
  const limitParam = c.req.query('limit');
  const limit = Math.min(MAX_FEED_ITEMS, Math.max(1, parseInt(limitParam ?? '20', 10) || 20));

  const feedStr = await redis.get(FEED_KEY);
  const feed: MilestoneIngestEnvelope['event'][] = feedStr ? (JSON.parse(feedStr) as MilestoneIngestEnvelope['event'][]) : [];
  const items = feed.slice(-limit).reverse();

  return c.json<MilestoneFeedResponse>({ ok: true, items }, 200);
});

/** GET /api/milestones/dead-letter — returns recent ingest rejections for operator visibility. */
milestoneFeed.get('/dead-letter', async (c) => {
  const raw = await redis.get(REJECTED_KEY);
  const items: MilestoneDeadLetterResponse['items'] = raw
    ? (JSON.parse(raw) as MilestoneDeadLetterResponse['items'])
    : [];
  const newest = items.slice().reverse();
  return c.json<MilestoneDeadLetterResponse>({ ok: true, items: newest, count: newest.length }, 200);
});
