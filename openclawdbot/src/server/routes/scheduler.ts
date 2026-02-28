import { Hono } from 'hono';
import { redis, realtime } from '@devvit/web/server';
import { createHmac } from 'node:crypto';
import type { MilestoneEvent, MilestoneRealtimeMessage } from '../../shared/milestones';
import { SIGNING_SECRET_REDIS_KEY } from './forms';

const FEED_KEY = 'milestones:feed';
const SEEN_KEY_PREFIX = 'milestone:seen:';
const MAX_FEED_ITEMS = 50;
export const FEED_URL_REDIS_KEY = 'milestones:feed-url';
const LAST_POLL_KEY = 'milestones:last-poll';
const REALTIME_CHANNEL = 'milestones_feed';

type FeedEntry = {
  idempotencyKey: string;
  sentAtUtc: string;
  event: MilestoneEvent;
  signature: string;
};

type RemoteFeed = {
  lastUpdated: string;
  entries: FeedEntry[];
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

function verifyEntry(entry: FeedEntry, secret: string): boolean {
  const { signature, ...payload } = entry;
  const expected = createHmac('sha256', secret)
    .update(JSON.stringify(sortObjectKeys(payload)))
    .digest('hex');
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

export type PollResult = { ok: true; added: number } | { ok: false; reason: string };

export async function runPoll(): Promise<PollResult> {
  const feedUrl = await redis.get(FEED_URL_REDIS_KEY);
  if (!feedUrl) return { ok: false, reason: 'feed URL not configured' };

  const secret = await redis.get(SIGNING_SECRET_REDIS_KEY);
  if (!secret) return { ok: false, reason: 'signing secret not configured' };

  console.log('[scheduler] polling feed:', feedUrl);

  let remoteFeed: RemoteFeed;
  try {
    const res = await fetch(feedUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    remoteFeed = (await res.json()) as RemoteFeed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[scheduler] feed fetch failed:', msg);
    return { ok: false, reason: `fetch failed: ${msg}` };
  }

  await redis.set(LAST_POLL_KEY, new Date().toISOString());

  const feedStr = await redis.get(FEED_KEY);
  const localFeed: MilestoneEvent[] = feedStr ? (JSON.parse(feedStr) as MilestoneEvent[]) : [];

  let added = 0;
  for (const entry of remoteFeed.entries) {
    const seenKey = `${SEEN_KEY_PREFIX}${entry.idempotencyKey}`;
    const already = await redis.get(seenKey);
    if (already) continue;

    if (!verifyEntry(entry, secret)) {
      console.warn('[scheduler] signature mismatch, skipping', entry.idempotencyKey);
      continue;
    }

    localFeed.push(entry.event);
    await redis.set(seenKey, '1');

    const msg: MilestoneRealtimeMessage = { event: entry.event };
    try {
      await realtime.send(REALTIME_CHANNEL, msg);
    } catch {
      // Non-fatal
    }
    added++;
  }

  if (added > 0) {
    await redis.set(FEED_KEY, JSON.stringify(localFeed.slice(-MAX_FEED_ITEMS)));
  }

  console.log(`[scheduler] poll complete — ${added} new milestones added (${remoteFeed.entries.length} entries in feed)`);
  return { ok: true, added };
}

export const schedulerRoutes = new Hono();

schedulerRoutes.post('/poll-milestones', async (c) => {
  const result = await runPoll();
  return c.json(result, 200);
});
