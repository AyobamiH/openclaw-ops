export type EvidenceClass = "direct" | "inferred" | "disputed" | "incomplete";

export type LifecycleState =
  | "extracted"
  | "normalized"
  | "linked"
  | "under_review"
  | "verified"
  | "challenged"
  | "rejected"
  | "published";

export type ReviewDisposition = "verify" | "challenge" | "reject" | "publish";

export type DecisionChainStageType =
  | "precursor"
  | "deliberation"
  | "formal_process"
  | "outcome"
  | "after_effects";

export interface DocumentRecord {
  documentId: string;
  versionGroupId: string;
  logicalSourceKey: string;
  title: string;
  sourceType: string;
  sourceCollection: string;
  checksumSha256: string;
  sizeBytes: number;
  objectKey: string;
  originalFilename: string;
  mimeType: string;
  publishedDate: string | null;
  parseStatus: "pending" | "running" | "complete" | "partial" | "failed";
  ocrStatus: "not_needed" | "not_configured" | "pending" | "complete" | "failed";
  parseWarnings: string[];
  supersedesDocumentId: string | null;
  ingestedAt: string;
  chunkCount: number;
  citationCount: number;
}

export interface EvidenceChunkRecord {
  chunkId: string;
  documentId: string;
  sequence: number;
  citationId: string;
  text: string;
  normalizedText: string;
  excerpt: string;
  pageStart: number | null;
  pageEnd: number | null;
  anchorStart: number;
  anchorEnd: number;
}

export interface SourceCitationRecord {
  citationId: string;
  documentId: string;
  chunkId: string;
  locatorType: "page" | "sequence";
  locatorValue: string;
  excerpt: string;
  pageStart: number | null;
  pageEnd: number | null;
  anchorStart: number;
  anchorEnd: number;
}

export interface EntityRecord {
  entityId: string;
  canonicalKey: string;
  entityType: "person" | "organization" | "committee" | "department" | "role" | "location";
  displayName: string;
  confidence: number;
  mentionCount: number;
  documentIds: string[];
}

export interface EntityMentionRecord {
  mentionId: string;
  entityId: string;
  documentId: string;
  chunkId: string;
  citationId: string;
  surfaceForm: string;
  resolutionState: "resolved" | "candidate";
  confidence: number;
}

export interface EventRecord {
  eventId: string;
  eventType: string;
  documentId: string;
  chunkId: string;
  citationId: string;
  title: string;
  summary: string;
  eventDate: string | null;
  evidenceClass: EvidenceClass;
  lifecycleState: LifecycleState;
  entityIds: string[];
}

export interface ClaimRecord {
  claimId: string;
  documentId: string;
  chunkId: string;
  citationIds: string[];
  claimText: string;
  evidenceClass: EvidenceClass;
  lifecycleState: LifecycleState;
  confidence: number;
}

export interface RelationshipRecord {
  relationshipId: string;
  documentId: string;
  chunkId: string;
  citationId: string;
  subjectEntityId: string;
  predicate: string;
  objectEntityId: string | null;
  eventId: string | null;
  summary: string;
  evidenceClass: EvidenceClass;
  lifecycleState: LifecycleState;
  confidence: number;
}

export interface DecisionChainStageRecord {
  stage: DecisionChainStageType;
  label: string;
  eventIds: string[];
  claimIds: string[];
  relationshipIds: string[];
  summary: string;
  evidenceClass: EvidenceClass;
}

export interface DecisionChainGapRecord {
  gapId: string;
  stage: DecisionChainStageType;
  label: string;
  description: string;
  severity: "info" | "warning" | "critical";
}

export interface DecisionChainAlternativeRecord {
  alternativeId: string;
  summary: string;
  rationale: string;
  citationIds: string[];
  confidence: number;
}

export interface DecisionChainRecord {
  decisionChainId: string;
  versionKey: string;
  sourceCollection: string;
  subject: string;
  subjectEntityIds: string[];
  status: "draft" | "under_review" | "published";
  verificationState: Extract<LifecycleState, "under_review" | "verified" | "challenged" | "rejected" | "published">;
  confidence: number;
  summary: string;
  documentIds: string[];
  eventIds: string[];
  claimIds: string[];
  relationshipIds: string[];
  stages: DecisionChainStageRecord[];
  gaps: DecisionChainGapRecord[];
  alternatives: DecisionChainAlternativeRecord[];
  assembledAt: string;
  reviewedAt: string | null;
  publishedAt: string | null;
  revision: number;
}

export interface ReviewRecord {
  reviewId: string;
  targetType: "claim" | "relationship" | "event" | "decision_chain";
  targetId: string;
  disposition: ReviewDisposition;
  reviewer: string;
  notes: string;
  reviewedAt: string;
  previousState: string;
  resultingState: string;
  published: boolean;
}

export interface IngestionAuditRecord {
  ingestId: string;
  documentId: string | null;
  sourcePath: string;
  logicalSourceKey: string;
  checksumSha256: string | null;
  status: "ingested" | "deduplicated" | "failed";
  ingestedAt: string;
  message: string | null;
}

export interface LedgerState {
  documents: DocumentRecord[];
  chunks: EvidenceChunkRecord[];
  citations: SourceCitationRecord[];
  ingests: IngestionAuditRecord[];
  entities: EntityRecord[];
  mentions: EntityMentionRecord[];
  events: EventRecord[];
  claims: ClaimRecord[];
  relationships: RelationshipRecord[];
  decisionChains: DecisionChainRecord[];
  reviews: ReviewRecord[];
}
