import type {
  MilestoneEvent,
  MilestoneEvidence,
  MilestoneRiskStatus,
} from '../../shared/milestones';
import { createHmac } from 'node:crypto';

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

type BootstrapTemplate = {
  id: string;
  minutesAgo: number;
  scope: string;
  claim: string;
  evidence: MilestoneEvidence[];
  riskStatus: MilestoneRiskStatus;
  nextAction: string;
  source: MilestoneEvent['source'];
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

const BOOTSTRAP_TEMPLATES: BootstrapTemplate[] = [
  {
    id: 'orchestrator.started',
    minutesAgo: 34,
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
    nextAction: 'Watch the next scheduled automation pass for new work.',
    source: 'orchestrator',
  },
  {
    id: 'rss.sweep',
    minutesAgo: 28,
    scope: 'demand',
    claim: 'RSS sweep surfaced 3 new leads for follow-up.',
    evidence: [
      {
        type: 'log',
        path: '/app/logs/reddit-drafts.jsonl',
        summary: 'draft records appended during rss-sweep',
      },
    ],
    riskStatus: 'on-track',
    nextAction: 'Review priority leads and route them into reddit-response.',
    source: 'orchestrator',
  },
  {
    id: 'approval.requested',
    minutesAgo: 22,
    scope: 'governance',
    claim: 'Approval requested for build-refactor.',
    evidence: [
      {
        type: 'log',
        path: '/app/data/orchestrator-state.json',
        summary: 'approval request stored in orchestrator state',
      },
    ],
    riskStatus: 'at-risk',
    nextAction: 'Review the pending approval before the deployment window closes.',
    source: 'orchestrator',
  },
  {
    id: 'nightly.batch',
    minutesAgo: 18,
    scope: 'runtime',
    claim: 'Nightly batch completed: 2 docs synced, 3 items marked for draft.',
    evidence: [
      {
        type: 'log',
        path: '/app/logs/digests/digest-latest.json',
        summary: 'nightly digest compiled for the current queue',
      },
    ],
    riskStatus: 'on-track',
    nextAction: 'Process the marked queue items while the queue is fresh.',
    source: 'orchestrator',
  },
  {
    id: 'reddit.response',
    minutesAgo: 13,
    scope: 'community',
    claim: 'Reddit response drafted for r/OpenClaw.',
    evidence: [
      {
        type: 'log',
        path: '/app/logs/reddit-replies.jsonl',
        summary: 'reddit-helper saved a drafted response',
      },
    ],
    riskStatus: 'on-track',
    nextAction: 'Review the draft and post it if the context is still current.',
    source: 'orchestrator',
  },
  {
    id: 'approval.approved',
    minutesAgo: 8,
    scope: 'governance',
    claim: 'Approval granted for build-refactor.',
    evidence: [
      {
        type: 'log',
        path: '/app/data/orchestrator-state.json',
        summary: 'approval marked approved and replay queued',
      },
    ],
    riskStatus: 'on-track',
    nextAction: 'Monitor the replayed build-refactor task to completion.',
    source: 'operator',
  },
  {
    id: 'demand.summary',
    minutesAgo: 4,
    scope: 'demand',
    claim: 'Demand telemetry refreshed: 4 queued leads, 3 drafts.',
    evidence: [
      {
        type: 'metric',
        path: '/app/data/orchestrator-state.json',
        summary: 'queue=4, drafts=3, selected=2',
      },
    ],
    riskStatus: 'on-track',
    nextAction: 'Work the hottest demand lane while the queue is still warm.',
    source: 'orchestrator',
  },
];

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

function signEntry(entry: Omit<FeedEntry, 'signature'>, secret: string): string {
  return createHmac('sha256', secret)
    .update(JSON.stringify(sortObjectKeys(entry)))
    .digest('hex');
}

function buildInitialRemoteFeed(now = new Date()): RemoteFeed {
  const entries = BOOTSTRAP_TEMPLATES.map((template) => {
    const timestampUtc = new Date(
      now.getTime() - template.minutesAgo * 60_000
    ).toISOString();
    const event: MilestoneEvent = {
      milestoneId: `${template.id}.${timestampUtc}`,
      timestampUtc,
      scope: template.scope,
      claim: template.claim,
      evidence: template.evidence,
      riskStatus: template.riskStatus,
      nextAction: template.nextAction,
      source: template.source,
    };
    const unsigned: Omit<FeedEntry, 'signature'> = {
      idempotencyKey: event.milestoneId,
      sentAtUtc: timestampUtc,
      event,
    };

    return {
      ...unsigned,
      signature: signEntry(unsigned, DEFAULT_SIGNING_SECRET),
    };
  });

  return {
    lastUpdated: entries.at(-1)?.sentAtUtc ?? now.toISOString(),
    entries,
  };
}

const INITIAL_REMOTE_FEED: RemoteFeed = buildInitialRemoteFeed();

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

export const isLegacyStartupOnlyFeed = (feed: RemoteFeed | null): boolean => {
  if (!feed || feed.entries.length === 0) return false;

  return feed.entries.every(
    (entry) =>
      entry.event.scope === 'runtime' &&
      entry.event.claim === 'Orchestrator started successfully.'
  );
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
