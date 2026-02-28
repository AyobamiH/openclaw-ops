import { z } from 'zod';

export const MilestoneRiskStatusSchema = z.enum([
  'on-track',
  'at-risk',
  'blocked',
  'completed',
]);

export const MilestoneEvidenceSchema = z.object({
  type: z.enum(['doc', 'commit', 'issue', 'pr', 'runbook', 'metric', 'log']),
  path: z.string().min(1),
  summary: z.string().min(1),
  ref: z.string().optional(),
});

export const MilestoneEventSchema = z.object({
  milestoneId: z.string().min(1),
  timestampUtc: z.string().datetime(),
  scope: z.string().min(1),
  claim: z.string().min(1),
  evidence: z.array(MilestoneEvidenceSchema).min(1),
  riskStatus: MilestoneRiskStatusSchema,
  nextAction: z.string().min(1),
  source: z.enum(['orchestrator', 'agent', 'operator']).default('orchestrator'),
});

export const MilestoneIngestEnvelopeSchema = z.object({
  idempotencyKey: z.string().min(1),
  sentAtUtc: z.string().datetime(),
  event: MilestoneEventSchema,
});

export const MilestoneIngestHeadersSchema = z.object({
  'x-openclaw-signature': z.string().min(1),
  'x-openclaw-timestamp': z.string().min(1),
});

export type MilestoneRiskStatus = z.infer<typeof MilestoneRiskStatusSchema>;
export type MilestoneEvidence = z.infer<typeof MilestoneEvidenceSchema>;
export type MilestoneEvent = z.infer<typeof MilestoneEventSchema>;
export type MilestoneIngestEnvelope = z.infer<typeof MilestoneIngestEnvelopeSchema>;
export type MilestoneIngestHeaders = z.infer<typeof MilestoneIngestHeadersSchema>;

