import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import type {
  CommandCenterControlResponse,
  CommandCenterDemandResponse,
  CommandCenterOverviewResponse,
} from '../../shared/command-center';
import type { MilestoneEvent } from '../../shared/milestones';
import { COMMAND_CENTER_CONTROL_CLUSTERS } from '../../shared/command-center-static';
import {
  REALTIME_CHANNEL,
  normalizeStoredFeed,
} from '../core/milestone-pipeline';
import { FEED_KEY, MAX_FEED_ITEMS, REJECTED_KEY } from './milestones';
import { LAST_POLL_KEY } from './scheduler';
import {
  buildCommandCenterDemandResponse,
  loadDemandSummaryFeed,
} from './demand';

const POLL_STALE_MS = 5 * 60 * 1000;

type RejectedEntry = {
  timestampUtc: string;
  reason: string;
  idempotencyKey?: string;
};

type FeedRiskKey = keyof CommandCenterOverviewResponse['riskCounts'];

const RISK_KEY_MAP: Record<MilestoneEvent['riskStatus'], FeedRiskKey> = {
  'on-track': 'onTrack',
  'at-risk': 'atRisk',
  blocked: 'blocked',
  completed: 'completed',
};

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getFreshnessDetail(lastPollAt: string | null): {
  stale: boolean;
  detail: string;
} {
  if (!lastPollAt) {
    return {
      stale: true,
      detail: 'Warm poll pending',
    };
  }

  const timestamp = new Date(lastPollAt).getTime();
  if (Number.isNaN(timestamp)) {
    return {
      stale: true,
      detail: 'Poll status unavailable',
    };
  }

  const ageMs = Date.now() - timestamp;
  if (ageMs > POLL_STALE_MS) {
    return {
      stale: true,
      detail: 'Poll signal is stale',
    };
  }

  const ageMinutes = Math.max(1, Math.floor(ageMs / 60_000));
  return {
    stale: false,
    detail: `Last poll ${ageMinutes}m ago`,
  };
}

export const api = new Hono();

api.get('/command-center/overview', async (c) => {
  const [feedRaw, deadLetterRaw, lastPollAt] = await Promise.all([
    redis.get(FEED_KEY),
    redis.get(REJECTED_KEY),
    redis.get(LAST_POLL_KEY),
  ]);

  const feed = normalizeStoredFeed(parseJson(feedRaw));
  const visibleFeed = feed.slice(-MAX_FEED_ITEMS).reverse();
  const latest = visibleFeed[0] ?? null;

  const laneMap = new Map<string, string>();
  for (const item of visibleFeed) {
    const normalized = item.scope.trim().toLowerCase();
    if (!laneMap.has(normalized)) {
      laneMap.set(normalized, normalized);
    }
  }
  const activeLanes = Array.from(laneMap.values());
  const evidenceCount = visibleFeed.reduce(
    (sum, item) => sum + item.evidence.length,
    0
  );

  const riskCounts: CommandCenterOverviewResponse['riskCounts'] = {
    onTrack: 0,
    atRisk: 0,
    blocked: 0,
    completed: 0,
  };
  for (const item of visibleFeed) {
    const key = RISK_KEY_MAP[item.riskStatus];
    riskCounts[key] += 1;
  }

  const deadLetters = parseJson(deadLetterRaw);
  const deadLetterItems = Array.isArray(deadLetters)
    ? (deadLetters as RejectedEntry[])
    : [];
  const deadLetterCount = deadLetterItems.length;

  const freshness = getFreshnessDetail(lastPollAt ?? null);

  const overview: CommandCenterOverviewResponse = {
    ok: true,
    latest,
    visibleFeedCount: visibleFeed.length,
    evidenceCount,
    activeLaneCount: activeLanes.length,
    activeLanes,
    riskCounts,
    deadLetterCount,
    lastPollAt: lastPollAt ?? null,
    realtimeChannel: REALTIME_CHANNEL,
    proofNodes: [
      {
        id: 'emit',
        label: 'Emit',
        state: latest ? 'live' : 'idle',
        detail: latest ? latest.milestoneId : 'Awaiting first signal',
      },
      {
        id: 'verify',
        label: 'Verify',
        state: deadLetterCount > 0 ? 'warning' : latest ? 'live' : 'idle',
        detail:
          deadLetterCount > 0
            ? `${deadLetterCount} rejected payload${deadLetterCount === 1 ? '' : 's'}`
            : 'Signature path healthy',
      },
      {
        id: 'store',
        label: 'Store',
        state: visibleFeed.length > 0 ? 'live' : 'idle',
        detail:
          visibleFeed.length > 0
            ? `${visibleFeed.length} event${visibleFeed.length === 1 ? '' : 's'} retained`
            : 'Feed buffer empty',
      },
      {
        id: 'canon',
        label: 'Canon',
        state: freshness.stale ? 'warning' : 'live',
        detail: freshness.detail,
      },
      {
        id: 'broadcast',
        label: 'Broadcast',
        state: visibleFeed.length > 0 ? 'live' : 'idle',
        detail:
          visibleFeed.length > 0
            ? `Realtime channel ${REALTIME_CHANNEL}`
            : 'Realtime idle',
      },
      {
        id: 'surface',
        label: 'Surface',
        state: latest ? 'live' : 'idle',
        detail:
          latest?.claim ??
          'Proof layer is warming before the first milestone arrives',
      },
    ],
  };

  return c.json<CommandCenterOverviewResponse>(overview, 200);
});

api.get('/command-center/control', async (c) => {
  return c.json<CommandCenterControlResponse>(
    {
      ok: true,
      clusters: COMMAND_CENTER_CONTROL_CLUSTERS,
    },
    200
  );
});

api.get('/command-center/demand', async (c) => {
  const feed = await loadDemandSummaryFeed();
  return c.json<CommandCenterDemandResponse>(
    buildCommandCenterDemandResponse(feed),
    200
  );
});
