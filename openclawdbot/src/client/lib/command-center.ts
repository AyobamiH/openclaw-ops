import type {
  CommandCenterOverviewResponse,
  ControlTier,
  DemandSegmentState,
} from '../../shared/command-center';
import type { MilestoneEvent } from '../../shared/milestones';
import { formatTimeAgo } from './milestones';

const EMPTY_RISK_COUNTS: CommandCenterOverviewResponse['riskCounts'] = {
  onTrack: 0,
  atRisk: 0,
  blocked: 0,
  completed: 0,
};

export const formatPollFreshness = (lastPollAt: string | null): string => {
  if (!lastPollAt) return 'Warm poll pending';
  return `Last poll ${formatTimeAgo(lastPollAt)}`;
};

export const buildFallbackOverview = (
  items: MilestoneEvent[],
  realtimeChannel = 'milestones_feed'
): CommandCenterOverviewResponse => {
  const activeLaneSet = new Set<string>();
  const riskCounts = { ...EMPTY_RISK_COUNTS };

  for (const item of items) {
    activeLaneSet.add(item.scope.trim().toLowerCase());
    if (item.riskStatus === 'on-track') riskCounts.onTrack += 1;
    if (item.riskStatus === 'at-risk') riskCounts.atRisk += 1;
    if (item.riskStatus === 'blocked') riskCounts.blocked += 1;
    if (item.riskStatus === 'completed') riskCounts.completed += 1;
  }

  const latest = items[0] ?? null;
  const evidenceCount = items.reduce((sum, item) => sum + item.evidence.length, 0);
  const activeLanes = Array.from(activeLaneSet);

  return {
    ok: true,
    latest,
    visibleFeedCount: items.length,
    evidenceCount,
    activeLaneCount: activeLanes.length,
    activeLanes,
    riskCounts,
    deadLetterCount: 0,
    lastPollAt: null,
    realtimeChannel,
    proofNodes: [
      {
        id: 'emit',
        label: 'Emit',
        state: latest ? 'live' : 'idle',
        detail: latest?.milestoneId ?? 'Awaiting first signal',
      },
      {
        id: 'verify',
        label: 'Verify',
        state: latest ? 'live' : 'idle',
        detail: latest ? 'Integrity signal pending live summary' : 'No payloads yet',
      },
      {
        id: 'store',
        label: 'Store',
        state: items.length > 0 ? 'live' : 'idle',
        detail:
          items.length > 0
            ? `${items.length} event${items.length === 1 ? '' : 's'} cached locally`
            : 'Feed buffer empty',
      },
      {
        id: 'canon',
        label: 'Canon',
        state: 'warning',
        detail: 'Live overview unavailable',
      },
      {
        id: 'broadcast',
        label: 'Broadcast',
        state: items.length > 0 ? 'live' : 'idle',
        detail: `Realtime channel ${realtimeChannel}`,
      },
      {
        id: 'surface',
        label: 'Surface',
        state: latest ? 'live' : 'idle',
        detail: latest?.claim ?? 'Proof layer standing by',
      },
    ],
  };
};

export const getDemandStateMeta = (
  state: DemandSegmentState
): { label: string; ring: string; tone: string } => {
  if (state === 'hot') {
    return {
      label: 'Hot',
      ring: 'ring-rose-300/20',
      tone: 'bg-rose-300/10 text-rose-100',
    };
  }

  if (state === 'warm') {
    return {
      label: 'Warm',
      ring: 'ring-amber-300/20',
      tone: 'bg-amber-300/10 text-amber-100',
    };
  }

  return {
    label: 'Idle',
    ring: 'ring-white/10',
    tone: 'bg-white/[0.04] text-slate-300',
  };
};

export const getTierMeta = (
  tier: ControlTier
): { label: string; tone: string } => {
  if (tier === 'service-native') {
    return {
      label: 'Service-native',
      tone: 'bg-cyan-300/10 text-cyan-100',
    };
  }

  if (tier === 'balanced') {
    return {
      label: 'Balanced',
      tone: 'bg-emerald-300/10 text-emerald-100',
    };
  }

  if (tier === 'strategic') {
    return {
      label: 'Strategic',
      tone: 'bg-fuchsia-300/10 text-fuchsia-100',
    };
  }

  if (tier === 'heavy') {
    return {
      label: 'Heavy',
      tone: 'bg-blue-300/10 text-blue-100',
    };
  }

  return {
    label: 'Cheap',
    tone: 'bg-white/[0.04] text-slate-200',
  };
};
