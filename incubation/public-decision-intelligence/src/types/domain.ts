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
  entityType: "person" | "organization" | "committee" | "department" | "role" | "location";
  displayName: string;
  confidence: number;
}

export interface EventRecord {
  eventId: string;
  eventType: string;
  title: string;
  eventDate: string | null;
  reviewState: LifecycleState;
}

export interface ClaimRecord {
  claimId: string;
  claimText: string;
  evidenceClass: EvidenceClass;
  lifecycleState: LifecycleState;
}

export interface RelationshipRecord {
  relationshipId: string;
  predicate: string;
  evidenceClass: EvidenceClass;
  lifecycleState: LifecycleState;
}

export interface DecisionChainRecord {
  decisionChainId: string;
  subject: string;
  status: "draft" | "under_review" | "published";
  confidence: number;
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
}
