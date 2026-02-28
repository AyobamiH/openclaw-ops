import type {
  MilestoneIngestEnvelope,
  MilestoneIngestHeaders,
  MilestoneIngestResponse,
  MilestoneFeedResponse,
} from '../../shared/milestones';

export const MILESTONE_INGEST_PATH = '/internal/milestones/ingest';
export const MILESTONE_FEED_PATH = '/api/milestones/latest';

export type MilestoneIngestRequest = {
  headers: MilestoneIngestHeaders;
  body: MilestoneIngestEnvelope;
};

export type { MilestoneFeedResponse };

export type MilestoneEndpointResponse =
  | MilestoneIngestResponse
  | MilestoneFeedResponse;

