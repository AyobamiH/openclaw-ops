import type {
  MilestoneEvent,
  MilestoneEvidence,
  MilestoneRiskStatus,
} from '../../shared/milestones';

export const DEFAULT_FEED_URL =
  'https://cdn.jsdelivr.net/gh/AyobamiH/openclaw-ops@master/orchestrator/data/milestones-feed.json';
export const DEFAULT_SIGNING_SECRET =
  '96a9cb3cbfcd8f54ffd3255c5ab526dec5c5acf343eda62751bac5e682ebade3';
export const MILESTONE_WIKI_PAGE = 'milestones-feed';
export const REALTIME_CHANNEL = 'milestones_feed';

export type FeedEntry = {
  idempotencyKey: string;
  sentAtUtc: string;
  event: MilestoneEvent;
  signature: string;
};

export type RemoteFeed = {
  lastUpdated: string;
  entries: FeedEntry[];
};

const RISK_STATUSES: MilestoneRiskStatus[] = [
  'on-track',
  'at-risk',
  'blocked',
  'completed',
];
const EVIDENCE_TYPES: MilestoneEvidence['type'][] = [
  'doc',
  'commit',
  'issue',
  'pr',
  'runbook',
  'metric',
  'log',
];

const INITIAL_REMOTE_FEED: RemoteFeed = {
  lastUpdated: '2026-02-23T11:07:15.898Z',
  entries: [
    {
      idempotencyKey: 'orchestrator.started.2026-02-23T06:29:06.103Z',
      sentAtUtc: '2026-02-23T06:29:06.103Z',
      event: {
        milestoneId: 'orchestrator.started.2026-02-23T06:29:06.103Z',
        timestampUtc: '2026-02-23T06:29:06.103Z',
        scope: 'runtime',
        claim: 'Orchestrator started successfully.',
        evidence: [
          {
            type: 'log',
            path: '/app/data/orchestrator-state.json',
            summary: 'lastStartedAt set in orchestrator state',
          },
        ],
        riskStatus: 'on-track',
        nextAction: 'Monitor task queue for first incoming tasks.',
        source: 'orchestrator',
      },
      signature:
        'c207b60453e60c913bd3519901e6c91f8b22d34b6d59d50b3ed88dfe6463496a',
    },
    {
      idempotencyKey: 'orchestrator.started.2026-02-23T07:26:21.259Z',
      sentAtUtc: '2026-02-23T07:26:21.259Z',
      event: {
        milestoneId: 'orchestrator.started.2026-02-23T07:26:21.259Z',
        timestampUtc: '2026-02-23T07:26:21.259Z',
        scope: 'runtime',
        claim: 'Orchestrator started successfully.',
        evidence: [
          {
            type: 'log',
            path: '/app/data/orchestrator-state.json',
            summary: 'lastStartedAt set in orchestrator state',
          },
        ],
        riskStatus: 'on-track',
        nextAction: 'Monitor task queue for first incoming tasks.',
        source: 'orchestrator',
      },
      signature:
        '2af2e94b63401c19922c9a839e4e85378bf964fed7217a5ee4efca191e9097d2',
    },
    {
      idempotencyKey: 'orchestrator.started.2026-02-23T08:21:03.470Z',
      sentAtUtc: '2026-02-23T08:21:03.470Z',
      event: {
        milestoneId: 'orchestrator.started.2026-02-23T08:21:03.470Z',
        timestampUtc: '2026-02-23T08:21:03.470Z',
        scope: 'runtime',
        claim: 'Orchestrator started successfully.',
        evidence: [
          {
            type: 'log',
            path: '/app/data/orchestrator-state.json',
            summary: 'lastStartedAt set in orchestrator state',
          },
        ],
        riskStatus: 'on-track',
        nextAction: 'Monitor task queue for first incoming tasks.',
        source: 'orchestrator',
      },
      signature:
        '577cb7e82ccddc92278734685a979beb556d4114f074681c9019efb6a85c9eab',
    },
    {
      idempotencyKey: 'orchestrator.started.2026-02-23T11:07:15.898Z',
      sentAtUtc: '2026-02-23T11:07:15.898Z',
      event: {
        milestoneId: 'orchestrator.started.2026-02-23T11:07:15.898Z',
        timestampUtc: '2026-02-23T11:07:15.898Z',
        scope: 'runtime',
        claim: 'Orchestrator started successfully.',
        evidence: [
          {
            type: 'log',
            path: '/app/data/orchestrator-state.json',
            summary: 'lastStartedAt set in orchestrator state',
          },
        ],
        riskStatus: 'on-track',
        nextAction: 'Monitor task queue for first incoming tasks.',
        source: 'orchestrator',
      },
      signature:
        '0000000000000000000000000000000000000000000000000000000000000000',
    },
  ],
};

export const INITIAL_WIKI_FEED = JSON.stringify(INITIAL_REMOTE_FEED);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const asTimestamp = (value: unknown, fallback: string): string => {
  const candidate = readText(value);
  if (!candidate) return fallback;

  const timestamp = new Date(candidate);
  if (Number.isNaN(timestamp.getTime())) return fallback;
  return timestamp.toISOString();
};

const asRiskStatus = (value: unknown): MilestoneRiskStatus =>
  typeof value === 'string' &&
  RISK_STATUSES.includes(value as MilestoneRiskStatus)
    ? (value as MilestoneRiskStatus)
    : 'on-track';

const asEvidenceType = (value: unknown): MilestoneEvidence['type'] =>
  typeof value === 'string' &&
  EVIDENCE_TYPES.includes(value as MilestoneEvidence['type'])
    ? (value as MilestoneEvidence['type'])
    : 'log';

const normalizeEvidence = (value: unknown): MilestoneEvidence[] => {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((item) => {
    const ref = readText(item.ref);

    return {
      type: asEvidenceType(item.type),
      path: readText(item.path) ?? 'runtime',
      summary: readText(item.summary) ?? 'Runtime signal',
      ...(ref ? { ref } : {}),
    };
  });
};

export const normalizeMilestoneEvent = (
  value: unknown
): MilestoneEvent | null => {
  if (!isRecord(value)) return null;

  const milestoneId = readText(value.milestoneId);
  const scope = readText(value.scope);
  const claim = readText(value.claim);
  if (!milestoneId || !scope || !claim) return null;

  const now = new Date().toISOString();
  const source =
    value.source === 'orchestrator' ||
    value.source === 'agent' ||
    value.source === 'operator'
      ? value.source
      : null;

  return {
    milestoneId,
    timestampUtc: asTimestamp(value.timestampUtc, now),
    scope,
    claim,
    evidence: normalizeEvidence(value.evidence),
    riskStatus: asRiskStatus(value.riskStatus),
    nextAction: readText(value.nextAction) ?? '',
    ...(source ? { source } : {}),
  };
};

const normalizeFeedEntry = (value: unknown): FeedEntry | null => {
  if (!isRecord(value)) return null;

  const idempotencyKey = readText(value.idempotencyKey);
  const signature = readText(value.signature);
  const event = normalizeMilestoneEvent(value.event);
  if (!idempotencyKey || !signature || !event) return null;

  return {
    idempotencyKey,
    sentAtUtc: asTimestamp(value.sentAtUtc, event.timestampUtc),
    event,
    signature,
  };
};

export const normalizeStoredFeed = (value: unknown): MilestoneEvent[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeMilestoneEvent(item))
    .filter((item): item is MilestoneEvent => item !== null)
    .sort(
      (left, right) =>
        new Date(left.timestampUtc).getTime() -
        new Date(right.timestampUtc).getTime()
    );
};

export const normalizeRemoteFeed = (value: unknown): RemoteFeed | null => {
  if (!isRecord(value)) return null;

  const entries = Array.isArray(value.entries)
    ? value.entries
        .map((entry) => normalizeFeedEntry(entry))
        .filter((entry): entry is FeedEntry => entry !== null)
    : [];

  const deduped = new Map<string, FeedEntry>();
  for (const entry of entries) {
    deduped.set(entry.idempotencyKey, entry);
  }

  const sortedEntries = Array.from(deduped.values()).sort(
    (left, right) =>
      new Date(left.sentAtUtc).getTime() - new Date(right.sentAtUtc).getTime()
  );

  const fallbackTimestamp =
    sortedEntries.at(-1)?.sentAtUtc ?? new Date().toISOString();

  return {
    lastUpdated: asTimestamp(value.lastUpdated, fallbackTimestamp),
    entries: sortedEntries,
  };
};

export const parseRemoteFeedText = (raw: string): RemoteFeed | null => {
  try {
    return normalizeRemoteFeed(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const toRemoteFeedText = (feed: RemoteFeed): string =>
  JSON.stringify(feed);

export const normalizeFeedUrl = (value: string | null | undefined): string => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return DEFAULT_FEED_URL;

  const rawGithub = trimmed.match(
    /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/
  );
  if (!rawGithub) return trimmed;

  const [, owner, repo, ref, path] = rawGithub;
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${path}`;
};
