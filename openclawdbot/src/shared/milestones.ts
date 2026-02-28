export type MilestoneRiskStatus =
  | 'on-track'
  | 'at-risk'
  | 'blocked'
  | 'completed';

export type MilestoneEvidence = {
  type: 'doc' | 'commit' | 'issue' | 'pr' | 'runbook' | 'metric' | 'log';
  path: string;
  summary: string;
  ref?: string;
};

export type MilestoneEvent = {
  milestoneId: string;
  timestampUtc: string;
  scope: string;
  claim: string;
  evidence: MilestoneEvidence[];
  riskStatus: MilestoneRiskStatus;
  nextAction: string;
  source?: 'orchestrator' | 'agent' | 'operator';
};

export type MilestoneIngestEnvelope = {
  idempotencyKey: string;
  sentAtUtc: string;
  event: MilestoneEvent;
};

export type MilestoneIngestHeaders = {
  'x-openclaw-signature': string;
  'x-openclaw-timestamp': string;
};

export type MilestoneIngestResponse =
  | { ok: true; status: 'accepted'; milestoneId: string }
  | { ok: true; status: 'duplicate'; milestoneId: string }
  | { ok: false; status: 'rejected'; reason: string };

export type MilestoneFeedResponse = {
  ok: true;
  items: MilestoneEvent[];
};

export type MilestoneDeadLetterResponse = {
  ok: true;
  items: Array<{ timestampUtc: string; reason: string; idempotencyKey?: string }>;
  count: number;
};

export type MilestoneRealtimeMessage = {
  event: MilestoneEvent;
};

