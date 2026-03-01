import type {
  MilestoneEvent,
  MilestoneRiskStatus,
} from '../../shared/milestones';

const RISK_STATUSES: MilestoneRiskStatus[] = [
  'on-track',
  'at-risk',
  'blocked',
  'completed',
];
const EVIDENCE_TYPES = [
  'doc',
  'commit',
  'issue',
  'pr',
  'runbook',
  'metric',
  'log',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;

const asRiskStatus = (value: unknown): MilestoneRiskStatus =>
  typeof value === 'string' &&
  RISK_STATUSES.includes(value as MilestoneRiskStatus)
    ? (value as MilestoneRiskStatus)
    : 'on-track';

const asEvidenceType = (
  value: unknown
): MilestoneEvent['evidence'][number]['type'] =>
  typeof value === 'string' &&
  EVIDENCE_TYPES.includes(value as (typeof EVIDENCE_TYPES)[number])
    ? (value as MilestoneEvent['evidence'][number]['type'])
    : 'log';

export const normalizeMilestoneEvent = (
  value: unknown
): MilestoneEvent | null => {
  if (!isRecord(value)) return null;

  const timestampUtc = asString(value.timestampUtc, new Date().toISOString());
  const scope = asString(value.scope, 'system');
  const claim = asString(value.claim, 'Status updated.');
  const milestoneId = asString(
    value.milestoneId,
    `${scope}-${timestampUtc}-${claim}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'local-milestone'
  );
  const source =
    value.source === 'orchestrator' ||
    value.source === 'agent' ||
    value.source === 'operator'
      ? value.source
      : null;
  const evidence = Array.isArray(value.evidence)
    ? value.evidence.filter(isRecord)
    : [];

  return {
    milestoneId,
    timestampUtc,
    scope,
    claim,
    evidence: evidence.map((item) => {
      const ref = typeof item.ref === 'string' ? item.ref : null;

      return {
        type: asEvidenceType(item.type),
        path: asString(item.path, 'runtime'),
        summary: asString(item.summary, 'Runtime signal'),
        ...(ref ? { ref } : {}),
      };
    }),
    riskStatus: asRiskStatus(value.riskStatus),
    nextAction:
      typeof value.nextAction === 'string' ? value.nextAction.trim() : '',
    ...(source ? { source } : {}),
  };
};

export const normalizeMilestoneEvents = (value: unknown): MilestoneEvent[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeMilestoneEvent(item))
    .filter((item): item is MilestoneEvent => item !== null);
};

export const prependMilestoneEvent = (
  currentItems: MilestoneEvent[],
  nextItem: unknown,
  limit: number
): MilestoneEvent[] => {
  const normalized = normalizeMilestoneEvent(nextItem);

  if (!normalized) return currentItems;

  const deduped = currentItems.filter(
    (item) => item.milestoneId !== normalized.milestoneId
  );
  return [normalized, ...deduped].slice(0, limit);
};

export const formatTimeAgo = (iso: string): string => {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return 'pending';

  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
};
