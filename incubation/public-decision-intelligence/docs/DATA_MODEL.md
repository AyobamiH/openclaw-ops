# Data Model

## Document

Core fields:

- `documentId`
- `versionGroupId`
- `logicalSourceKey`
- `title`
- `sourceType`
- `sourceCollection`
- `ingestedAt`
- `checksumSha256`
- `originalFilename`
- `mimeType`
- `publishedDate`
- `versionGroupId`
- `supersedesDocumentId`
- `storageObjectKey`
- `sizeBytes`
- `ocrStatus`
- `parseStatus`

Relationships:

- has many evidence chunks
- has many source citations
- has many entity mentions
- can contribute to many events, claims, and decision chains

## Evidence Chunk

Core fields:

- `chunkId`
- `documentId`
- `citationId`
- `sequence`
- `text`
- `normalizedText`
- `pageStart`
- `pageEnd`
- `anchorStart`
- `anchorEnd`
- `vectorEmbeddingId`

Relationships:

- belongs to one document
- supports many claims, events, and relationships through citations

## Source Citation

Core fields:

- `citationId`
- `documentId`
- `chunkId`
- `locatorType`
- `locatorValue`
- `excerpt`
- `checksumFragment`

Purpose:

- stable pointer into original source material
- preserve the exact evidence location used for a derived object

## Entity

Core fields:

- `entityId`
- `entityType`
- `displayName`
- `canonicalName`
- `normalizedName`
- `status`
- `confidence`

Relationships:

- has many mentions
- can participate in many relationships
- can appear in many events and decision chains

## Entity Mention

Core fields:

- `mentionId`
- `documentId`
- `chunkId`
- `entityId`
- `surfaceForm`
- `resolutionState`
- `confidence`

## Event

Core fields:

- `eventId`
- `eventType`
- `title`
- `eventDate`
- `datePrecision`
- `summary`
- `extractionState`
- `reviewState`

Relationships:

- supported by many citations
- linked to many entities in role-specific ways
- can appear in one or more decision chains

## Claim

Core fields:

- `claimId`
- `claimText`
- `claimType`
- `evidenceClass`
- `lifecycleState`
- `confidence`
- `reviewState`

Relationships:

- supported by one or more citations
- may support or challenge events, relationships, and decisions

## Relationship

Core fields:

- `relationshipId`
- `subjectEntityId`
- `predicate`
- `objectEntityId`
- `eventId`
- `evidenceClass`
- `lifecycleState`
- `confidence`

Relationships:

- may be direct entity-to-entity or entity-to-event
- must always preserve evidence linkage

## Decision Chain

Core fields:

- `decisionChainId`
- `subject`
- `status`
- `summary`
- `confidence`
- `reviewState`

Structured stages:

- precursor
- deliberation
- formal process
- outcome
- after-effects

## Review Record

Core fields:

- `reviewRecordId`
- `targetType`
- `targetId`
- `reviewState`
- `reviewerId`
- `reviewedAt`
- `reasoning`
- `disposition`

## Audit / Provenance Fields

Every major table should preserve:

- `createdAt`
- `updatedAt`
- `createdBy`
- `updatedBy`
- `derivationMethod`
- `derivationVersion`
- `sourceRunId`

Those fields are required to keep the backend explainable as extraction logic
changes over time.
