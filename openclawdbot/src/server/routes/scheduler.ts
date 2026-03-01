import { Hono } from 'hono';
import { redis, realtime, reddit, context } from '@devvit/web/server';
import { createHmac } from 'node:crypto';
import type {
  MilestoneEvent,
  MilestoneRealtimeMessage,
} from '../../shared/milestones';
import {
  DEFAULT_FEED_URL,
  FeedEntry,
  INITIAL_WIKI_FEED,
  isLegacyStartupOnlyFeed,
  MILESTONE_WIKI_PAGE,
  normalizeFeedUrl,
  normalizeStoredFeed,
  parseRemoteFeedText,
  REALTIME_CHANNEL,
  RemoteFeed,
  toRemoteFeedText,
} from '../core/milestone-pipeline';
import { SIGNING_SECRET_REDIS_KEY } from './forms';

const FEED_KEY = 'milestones:feed';
const SEEN_KEY_PREFIX = 'milestone:seen:';
const MAX_FEED_ITEMS = 50;
export const FEED_URL_REDIS_KEY = 'milestones:feed-url';
export const LAST_POLL_KEY = 'milestones:last-poll';

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

export type PollResult =
  | { ok: true; added: number }
  | { ok: false; reason: string };

async function refreshWikiFromRemote(feedUrl: string): Promise<void> {
  try {
    const res = await fetch(feedUrl);
    if (!res.ok) {
      console.warn('[scheduler] remote fetch returned non-OK:', res.status);
      return;
    }

    const content = await res.text();
    const remoteFeed = parseRemoteFeedText(content);
    if (!remoteFeed) {
      console.warn('[scheduler] remote feed was invalid, keeping current wiki');
      return;
    }

    await reddit.updateWikiPage({
      subredditName: context.subredditName,
      page: MILESTONE_WIKI_PAGE,
      content: toRemoteFeedText(remoteFeed),
      reason: 'scheduler sync',
    });
    console.log('[scheduler] wiki refreshed from remote feed');
  } catch {
    // Non-fatal — wiki still has last-known-good state
    console.warn('[scheduler] remote fetch failed, reading existing wiki');
  }
}

async function readCanonicalWikiFeed(): Promise<RemoteFeed> {
  try {
    const wikiPage = await reddit.getWikiPage(
      context.subredditName,
      MILESTONE_WIKI_PAGE
    );
    if (!wikiPage.content) throw new Error('wiki page is empty');

    const parsed = parseRemoteFeedText(wikiPage.content);
    if (!parsed) throw new Error('wiki page content is invalid');
    if (isLegacyStartupOnlyFeed(parsed)) {
      throw new Error('wiki page content is a legacy startup-only seed');
    }
    return parsed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[scheduler] wiki read failed, reseeding default feed:', msg);

    const fallback = parseRemoteFeedText(INITIAL_WIKI_FEED);
    if (!fallback) {
      throw new Error('built-in fallback feed is invalid');
    }

    await reddit.updateWikiPage({
      subredditName: context.subredditName,
      page: MILESTONE_WIKI_PAGE,
      content: INITIAL_WIKI_FEED,
      reason: 'scheduler recovery',
    });

    return fallback;
  }
}

export async function runPoll(): Promise<PollResult> {
  const secret = await redis.get(SIGNING_SECRET_REDIS_KEY);
  if (!secret) return { ok: false, reason: 'signing secret not configured' };

  // Try to refresh the wiki from jsDelivr CDN (orchestrator pushes there via git).
  // If fetch succeeds, write fresh data to wiki so it stays up to date.
  // If fetch is blocked (PERMISSIONS_DENIED), fall through and read the existing wiki.
  const configuredUrl = await redis.get(FEED_URL_REDIS_KEY);
  const feedUrl = normalizeFeedUrl(configuredUrl ?? DEFAULT_FEED_URL);
  if (configuredUrl !== feedUrl) {
    await redis.set(FEED_URL_REDIS_KEY, feedUrl);
  }

  await refreshWikiFromRemote(feedUrl);

  // Always read from wiki — the canonical source
  console.log(
    `[scheduler] reading milestones wiki for r/${context.subredditName}...`
  );

  let remoteFeed: RemoteFeed;
  try {
    remoteFeed = await readCanonicalWikiFeed();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[scheduler] wiki read failed:', msg);
    return { ok: false, reason: `wiki read failed: ${msg}` };
  }

  await redis.set(LAST_POLL_KEY, new Date().toISOString());

  const feedStr = await redis.get(FEED_KEY);
  let parsedLocalFeed: unknown = [];
  try {
    parsedLocalFeed = feedStr ? JSON.parse(feedStr) : [];
  } catch {
    parsedLocalFeed = [];
  }
  const localFeed: MilestoneEvent[] = normalizeStoredFeed(parsedLocalFeed);

  let added = 0;
  for (const entry of remoteFeed.entries) {
    const seenKey = `${SEEN_KEY_PREFIX}${entry.idempotencyKey}`;
    const already = await redis.get(seenKey);
    if (already) continue;

    if (!verifyEntry(entry, secret)) {
      console.warn(
        '[scheduler] signature mismatch, skipping',
        entry.idempotencyKey
      );
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

  await redis.set(FEED_KEY, JSON.stringify(localFeed.slice(-MAX_FEED_ITEMS)));

  console.log(
    `[scheduler] poll complete — ${added} new milestones added (${remoteFeed.entries.length} entries in feed)`
  );
  return { ok: true, added };
}

export const schedulerRoutes = new Hono();

schedulerRoutes.post('/poll-milestones', async (c) => {
  const result = await runPoll();
  return c.json(result, 200);
});
