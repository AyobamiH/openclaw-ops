import type { MilestoneEvent } from './milestones';

export type ProofNodeId =
  | 'emit'
  | 'verify'
  | 'store'
  | 'canon'
  | 'broadcast'
  | 'surface';

export type ProofNodeState = 'live' | 'warning' | 'idle';

export type CommandCenterOverviewResponse = {
  ok: true;
  latest: MilestoneEvent | null;
  visibleFeedCount: number;
  evidenceCount: number;
  activeLaneCount: number;
  activeLanes: string[];
  riskCounts: {
    onTrack: number;
    atRisk: number;
    blocked: number;
    completed: number;
  };
  deadLetterCount: number;
  lastPollAt: string | null;
  realtimeChannel: string;
  proofNodes: Array<{
    id: ProofNodeId;
    label: string;
    state: ProofNodeState;
    detail: string;
  }>;
};

export type ControlTier =
  | 'cheap'
  | 'balanced'
  | 'heavy'
  | 'strategic'
  | 'service-native';

export type ControlNetworkMode = 'local' | 'allowlisted' | 'service-native';

export type ControlApprovalClass =
  | 'approval-gated'
  | 'bounded'
  | 'service-native';

export type CommandCenterEngine = {
  id: string;
  name: string;
  task: string;
  model: string;
  tier: ControlTier;
  allowedSkills: string[];
  networkMode: ControlNetworkMode;
  timeoutLabel: string;
  approvalClass: ControlApprovalClass;
};

export type CommandCenterControlResponse = {
  ok: true;
  clusters: Array<{
    id: string;
    label: string;
    engines: CommandCenterEngine[];
  }>;
};

export type DemandSegmentState = 'hot' | 'warm' | 'idle';

export type CommandCenterDemandResponse = {
  ok: true;
  segments: Array<{
    id: string;
    label: string;
    clusterLabels: string[];
    staticWeight: number;
    liveSignalCount: number;
    state: DemandSegmentState;
  }>;
  summary: {
    totalSegments: number;
    hotSegments: number;
    demandNarrative: string;
    topSegmentLabel: string | null;
    topPillarLabel: string | null;
    stale: boolean;
    source: 'live' | 'stale' | 'fallback';
    snapshotGeneratedAt: string | null;
    queueTotal: number;
    draftTotal: number;
    selectedForDraftTotal: number;
  };
};
