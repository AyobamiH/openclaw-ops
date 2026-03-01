export type DemandSummaryTagCounts = {
  draft: number;
  priority: number;
  manualReview: number;
};

export type DemandSummaryTopItem = {
  id: string;
  label: string;
  count: number;
};

export type DemandSummarySegmentState = 'hot' | 'warm' | 'idle';

export type DemandSummarySegment = {
  id: string;
  label: string;
  liveSignalCount: number;
  state: DemandSummarySegmentState;
  staticWeight: number;
  clusterLabels: string[];
};

export type DemandSummarySnapshot = {
  summaryId: string;
  generatedAtUtc: string;
  source: 'orchestrator';
  queueTotal: number;
  draftTotal: number;
  selectedForDraftTotal: number;
  tagCounts: DemandSummaryTagCounts;
  topPillars: DemandSummaryTopItem[];
  topKeywordClusters: DemandSummaryTopItem[];
  segments: DemandSummarySegment[];
};

export type DemandSummaryIngestEnvelope = {
  idempotencyKey: string;
  sentAtUtc: string;
  snapshot: DemandSummarySnapshot;
};

export type DemandSummaryIngestHeaders = {
  'x-openclaw-signature': string;
  'x-openclaw-timestamp': string;
};

export type DemandSummaryIngestResponse =
  | { ok: true; status: 'accepted'; summaryId: string }
  | { ok: true; status: 'duplicate'; summaryId: string }
  | { ok: false; status: 'rejected'; reason: string };

export type DemandSummaryFeedResponse = {
  ok: true;
  snapshot: DemandSummarySnapshot | null;
  stale: boolean;
};

export type DemandSummaryRealtimeMessage = {
  summaryId: string;
  generatedAtUtc: string;
};
