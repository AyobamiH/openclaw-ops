import type {
  ClaimRecord,
  EntityRecord,
  EventRecord,
  LedgerState,
  RelationshipRecord
} from "../types/domain.js";

export function buildEntityProjection(ledger: LedgerState, entity: EntityRecord) {
  const mentions = ledger.mentions.filter((mention) => mention.entityId === entity.entityId);
  const events = ledger.events.filter((event) => event.entityIds.includes(entity.entityId));
  const relationships = ledger.relationships.filter(
    (relationship) =>
      relationship.subjectEntityId === entity.entityId || relationship.objectEntityId === entity.entityId
  );
  const claims = ledger.claims.filter((claim) =>
    mentions.some((mention) => mention.documentId === claim.documentId && mention.chunkId === claim.chunkId)
  );
  const documents = ledger.documents.filter((document) => entity.documentIds.includes(document.documentId));
  const documentDates = documents.map((document) => document.ingestedAt).sort((a, b) => a.localeCompare(b));

  return {
    entity,
    firstSeenAt: documentDates[0] ?? null,
    lastSeenAt: documentDates[documentDates.length - 1] ?? null,
    documentCount: entity.documentIds.length,
    mentionCount: mentions.length,
    eventCount: events.length,
    relationshipCount: relationships.length,
    claimCount: claims.length
  };
}

export function buildClaimProjection(ledger: LedgerState, claim: ClaimRecord) {
  return {
    claim,
    document: ledger.documents.find((document) => document.documentId === claim.documentId) ?? null,
    chunk: ledger.chunks.find((chunk) => chunk.chunkId === claim.chunkId) ?? null,
    citations: ledger.citations.filter((citation) => claim.citationIds.includes(citation.citationId))
  };
}

export function buildEventProjection(ledger: LedgerState, event: EventRecord) {
  return {
    event,
    document: ledger.documents.find((document) => document.documentId === event.documentId) ?? null,
    entities: ledger.entities.filter((entity) => event.entityIds.includes(entity.entityId)),
    claims: ledger.claims.filter((claim) => claim.documentId === event.documentId && claim.chunkId === event.chunkId),
    citation: ledger.citations.find((citation) => citation.citationId === event.citationId) ?? null
  };
}

export function buildRelationshipProjection(ledger: LedgerState, relationship: RelationshipRecord) {
  return {
    relationship,
    document: ledger.documents.find((document) => document.documentId === relationship.documentId) ?? null,
    chunk: ledger.chunks.find((chunk) => chunk.chunkId === relationship.chunkId) ?? null,
    subject: ledger.entities.find((entity) => entity.entityId === relationship.subjectEntityId) ?? null,
    object: relationship.objectEntityId
      ? ledger.entities.find((entity) => entity.entityId === relationship.objectEntityId) ?? null
      : null,
    event: relationship.eventId
      ? ledger.events.find((event) => event.eventId === relationship.eventId) ?? null
      : null,
    citation: ledger.citations.find((citation) => citation.citationId === relationship.citationId) ?? null
  };
}
