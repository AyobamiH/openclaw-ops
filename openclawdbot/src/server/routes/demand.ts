import { createHmac } from 'node:crypto';
import { Hono } from 'hono';
import { redis, realtime } from '@devvit/web/server';
import type { CommandCenterDemandResponse } from '../../shared/command-center';
import { COMMAND_CENTER_DEMAND_SEGMENTS } from '../../shared/command-center-static';
import type {
  DemandSummaryFeedResponse,
  DemandSummaryIngestEnvelope,
  DemandSummaryIngestResponse,
  DemandSummaryRealtimeMessage,
  DemandSummarySnapshot,
} from '../../shared/demand-summary';
import { SIGNING_SECRET_REDIS_KEY } from './forms';

export const DEMAND_SUMMARY_KEY = 'demand:summary:latest';
const DEMAND_SEEN_KEY_PREFIX = 'demand:summary:seen:';
export const DEMAND_REJECTED_KEY = 'demand:summary:rejected';
export const DEMAND_LAST_UPDATE_KEY = 'demand:summary:last-update';
export const DEMAND_REALTIME_CHANNEL = 'demand_summary';

const MAX_REJECTED_ITEMS = 100;
const DEMAND_STALE_MS = 10 * 60 * 1000;

type RejectedEntry = {
  timestampUtc: string;
  reason: string;
  idempotencyKey?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const readCount = (value: unknown): number => {
  const next = Number(value);
  if (!Number.isFinite(next) || next < 0) return 0;
  return Math.floor(next);
};

function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as object).sort()) {
      sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
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

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function normalizeTopItems(
  value: unknown
): DemandSummarySnapshot['topPillars'] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((item) => {
      const id = readText(item.id);
      const label = readText(item.label);
      if (!id || !label) return null;

      return {
        id,
        label,
        count: readCount(item.count),
      };
    })
    .filter(
      (item): item is DemandSummarySnapshot['topPillars'][number] =>
        item !== null
    );
}

function normalizeSegments(
  value: unknown
): DemandSummarySnapshot['segments'] | null {
  if (!Array.isArray(value)) return null;

  const normalized = value
    .filter(isRecord)
    .map((item) => {
      const id = readText(item.id);
      const label = readText(item.label);
      if (!id || !label) return null;

      const state =
        item.state === 'hot' || item.state === 'warm' || item.state === 'idle'
          ? item.state
          : 'idle';
      const clusterLabels = Array.isArray(item.clusterLabels)
        ? item.clusterLabels
            .map((entry) => readText(entry))
            .filter((entry): entry is string => entry !== null)
        : [];

      return {
        id,
        label,
        liveSignalCount: readCount(item.liveSignalCount),
        state,
        staticWeight: readCount(item.staticWeight),
        clusterLabels,
      };
    })
    .filter(
      (item): item is DemandSummarySnapshot['segments'][number] => item !== null
    );

  return normalized.length > 0 ? normalized : null;
}

export function normalizeDemandSummarySnapshot(
  value: unknown
): DemandSummarySnapshot | null {
  if (!isRecord(value)) return null;

  const summaryId = readText(value.summaryId);
  const generatedAtUtc = readText(value.generatedAtUtc);
  if (!summaryId || !generatedAtUtc) return null;

  const timestamp = new Date(generatedAtUtc);
  if (Number.isNaN(timestamp.getTime())) return null;

  const source = value.source === 'orchestrator' ? 'orchestrator' : null;
  if (!source) return null;

  const tagCountsRecord = isRecord(value.tagCounts) ? value.tagCounts : null;
  if (!tagCountsRecord) return null;

  const segments = normalizeSegments(value.segments);
  if (!segments) return null;

  return {
    summaryId,
    generatedAtUtc: timestamp.toISOString(),
    source,
    queueTotal: readCount(value.queueTotal),
    draftTotal: readCount(value.draftTotal),
    selectedForDraftTotal: readCount(value.selectedForDraftTotal),
    tagCounts: {
      draft: readCount(tagCountsRecord.draft),
      priority: readCount(tagCountsRecord.priority),
      manualReview: readCount(tagCountsRecord.manualReview),
    },
    topPillars: normalizeTopItems(value.topPillars),
    topKeywordClusters: normalizeTopItems(value.topKeywordClusters),
    segments,
  };
}

export function isDemandSnapshotStale(
  snapshot: DemandSummarySnapshot | null
): boolean {
  if (!snapshot) return true;
  const generatedAt = new Date(snapshot.generatedAtUtc).getTime();
  if (Number.isNaN(generatedAt)) return true;
  return Date.now() - generatedAt > DEMAND_STALE_MS;
}

async function recordRejection(entry: RejectedEntry): Promise<void> {
  try {
    const raw = await redis.get(DEMAND_REJECTED_KEY);
    const list: RejectedEntry[] = raw
      ? (JSON.parse(raw) as RejectedEntry[])
      : [];
    list.push(entry);
    if (list.length > MAX_REJECTED_ITEMS) {
      list.splice(0, list.length - MAX_REJECTED_ITEMS);
    }
    await redis.set(DEMAND_REJECTED_KEY, JSON.stringify(list));
  } catch {
    // Never block ingest on rejection logging.
  }
}

export async function loadDemandSummaryFeed(): Promise<DemandSummaryFeedResponse> {
  const raw = await redis.get(DEMAND_SUMMARY_KEY);
  let parsed: unknown = null;

  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  const snapshot = normalizeDemandSummarySnapshot(parsed);
  return {
    ok: true,
    snapshot,
    stale: isDemandSnapshotStale(snapshot),
  };
}

function buildDemandNarrative(
  topSegmentLabel: string | null,
  topPillarLabel: string | null,
  source: CommandCenterDemandResponse['summary']['source']
): string {
  if (source === 'fallback') {
    return 'Demand telemetry is standing by. The board is ready to promote live queue pressure as soon as the orchestrator publishes the first signed summary.';
  }

  if (source === 'stale') {
    if (topSegmentLabel) {
      return `Holding the last verified demand snapshot. ${topSegmentLabel} remains the lead pressure vector while the live telemetry channel rehydrates.`;
    }
    return 'Holding the last verified demand snapshot while the live telemetry channel rehydrates.';
  }

  if (topSegmentLabel && topPillarLabel) {
    return `${topSegmentLabel} is leading the live queue pressure, with ${topPillarLabel} currently driving the strongest draft concentration.`;
  }

  if (topSegmentLabel) {
    return `${topSegmentLabel} is leading the live queue pressure across the visible demand surface.`;
  }

  return 'Live queue telemetry is healthy. The demand board is tracking the current pipeline without exposing the private core.';
}

export function buildCommandCenterDemandResponse(
  feed: DemandSummaryFeedResponse
): CommandCenterDemandResponse {
  const snapshot = feed.snapshot;
  const source: CommandCenterDemandResponse['summary']['source'] = !snapshot
    ? 'fallback'
    : feed.stale
      ? 'stale'
      : 'live';

  const snapshotById = new Map(
    snapshot?.segments.map((segment) => [segment.id, segment]) ?? []
  );

  const segments: CommandCenterDemandResponse['segments'] =
    COMMAND_CENTER_DEMAND_SEGMENTS.map((segment) => {
      const live = snapshotById.get(segment.id);

      return {
        ...segment,
        liveSignalCount: live?.liveSignalCount ?? 0,
        state: live?.state ?? 'idle',
      };
    });

  const ranked = segments
    .filter((segment) => segment.liveSignalCount > 0)
    .sort((left, right) => {
      if (right.liveSignalCount !== left.liveSignalCount) {
        return right.liveSignalCount - left.liveSignalCount;
      }
      if (right.staticWeight !== left.staticWeight) {
        return right.staticWeight - left.staticWeight;
      }
      return left.label.localeCompare(right.label);
    });

  const hotSegments = segments.filter((segment) => segment.state === 'hot');
  const topSegmentLabel = ranked[0]?.label ?? null;
  const topPillarLabel = snapshot?.topPillars[0]?.label ?? null;

  return {
    ok: true,
    segments,
    summary: {
      totalSegments: segments.length,
      hotSegments: hotSegments.length,
      demandNarrative: buildDemandNarrative(
        topSegmentLabel,
        topPillarLabel,
        source
      ),
      topSegmentLabel,
      topPillarLabel,
      stale: feed.stale,
      source,
      snapshotGeneratedAt: snapshot?.generatedAtUtc ?? null,
      queueTotal: snapshot?.queueTotal ?? 0,
      draftTotal: snapshot?.draftTotal ?? 0,
      selectedForDraftTotal: snapshot?.selectedForDraftTotal ?? 0,
    },
  };
}

export const demandIngest = new Hono();
export const demandApi = new Hono();

demandIngest.post('/ingest', async (c) => {
  const now = new Date().toISOString();
  const secret = await redis.get(SIGNING_SECRET_REDIS_KEY);
  if (!secret) {
    return c.json<DemandSummaryIngestResponse>(
      {
        ok: false,
        status: 'rejected',
        reason: 'server misconfigured: MILESTONE_SIGNING_SECRET not set',
      },
      500
    );
  }

  const signature = c.req.header('x-openclaw-signature');
  const timestamp = c.req.header('x-openclaw-timestamp');
  if (!signature || !timestamp) {
    await recordRejection({
      timestampUtc: now,
      reason: 'missing x-openclaw-signature or x-openclaw-timestamp',
    });
    return c.json<DemandSummaryIngestResponse>(
      {
        ok: false,
        status: 'rejected',
        reason: 'missing x-openclaw-signature or x-openclaw-timestamp',
      },
      401
    );
  }

  let body: DemandSummaryIngestEnvelope;
  try {
    body = await c.req.json<DemandSummaryIngestEnvelope>();
  } catch {
    await recordRejection({ timestampUtc: now, reason: 'invalid JSON body' });
    return c.json<DemandSummaryIngestResponse>(
      { ok: false, status: 'rejected', reason: 'invalid JSON body' },
      400
    );
  }

  if (
    typeof body.idempotencyKey !== 'string' ||
    body.idempotencyKey.trim().length === 0
  ) {
    await recordRejection({
      timestampUtc: now,
      reason: 'missing idempotencyKey',
    });
    return c.json<DemandSummaryIngestResponse>(
      { ok: false, status: 'rejected', reason: 'missing idempotencyKey' },
      400
    );
  }

  const expected = signEnvelope(body, secret);
  if (!safeEqual(signature.toLowerCase(), expected.toLowerCase())) {
    await recordRejection({
      timestampUtc: now,
      reason: 'invalid signature',
      idempotencyKey: body.idempotencyKey,
    });
    return c.json<DemandSummaryIngestResponse>(
      { ok: false, status: 'rejected', reason: 'invalid signature' },
      401
    );
  }

  const snapshot = normalizeDemandSummarySnapshot(body.snapshot);
  if (!snapshot) {
    await recordRejection({
      timestampUtc: now,
      reason: 'invalid demand summary snapshot',
      idempotencyKey: body.idempotencyKey,
    });
    return c.json<DemandSummaryIngestResponse>(
      {
        ok: false,
        status: 'rejected',
        reason: 'invalid demand summary snapshot',
      },
      400
    );
  }

  const idempotencyKey = body.idempotencyKey.trim();
  const seenKey = DEMAND_SEEN_KEY_PREFIX + idempotencyKey;
  const alreadySeen = await redis.get(seenKey);
  if (alreadySeen) {
    return c.json<DemandSummaryIngestResponse>(
      { ok: true, status: 'duplicate', summaryId: snapshot.summaryId },
      200
    );
  }

  await redis.set(DEMAND_SUMMARY_KEY, JSON.stringify(snapshot));
  await redis.set(DEMAND_LAST_UPDATE_KEY, now);
  await redis.set(seenKey, '1');
  await realtime.send<DemandSummaryRealtimeMessage>(DEMAND_REALTIME_CHANNEL, {
    summaryId: snapshot.summaryId,
    generatedAtUtc: snapshot.generatedAtUtc,
  });

  return c.json<DemandSummaryIngestResponse>(
    { ok: true, status: 'accepted', summaryId: snapshot.summaryId },
    200
  );
});

demandApi.get('/command-center/demand-live', async (c) => {
  const feed = await loadDemandSummaryFeed();
  return c.json<DemandSummaryFeedResponse>(feed, 200);
});
