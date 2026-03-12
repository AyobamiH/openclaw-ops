# API Contract

## Versioning

The initial contract is namespaced under `/api/v1`.

## Documents

- `POST /api/v1/documents/ingest`
  - ingest a local source file into the evidence ledger
  - request includes source path, logical source key, source collection, source
    type, and optional publication metadata
  - response includes checksum, version lineage, parse status, chunk count, and
    citation count
- `GET /api/v1/documents`
  - list documents with metadata, ingest status, source collection, and version
    lineage
- `GET /api/v1/documents/:documentId`
  - return document metadata, parse status, related chunks, and citation
    availability

## Claims

- `GET /api/v1/claims`
  - list claims with lifecycle state, evidence class, and review state
- `GET /api/v1/claims/:claimId`
  - return the claim text, supporting citations, contradictions, and review
    history

## Entities

- `GET /api/v1/entities`
  - list canonical entities with counts, aliases, and role hints
- `GET /api/v1/entities/:entityId`
  - return mentions, linked events, linked relationships, and linked decisions

## Events

- `GET /api/v1/events`
  - list events by type, date, and review state
- `GET /api/v1/events/:eventId`
  - return event summary, participating entities, citations, and linked claims

## Decision Chains

- `GET /api/v1/decision-chains`
  - list reconstructed decisions with summary, confidence, and stage coverage
- `GET /api/v1/decision-chains/:decisionChainId`
  - return structured stages, citations, alternative interpretations, and gaps

## Search

- `POST /api/v1/search`
  - accept keyword, entity, date, event type, and decision filters
  - return grouped results that preserve evidence context

## Review

- `GET /api/v1/review/queue`
  - return items awaiting review or challenge
- `POST /api/v1/review/:targetType/:targetId`
  - submit a review disposition with reasoning and evidence notes

## Health / Admin

- `GET /health`
  - liveness and startup posture
- `GET /api/v1/admin/ingestion/jobs`
  - ingestion and extraction job visibility

The contract must remain evidence-first. Responses should prefer stable IDs,
lineage metadata, and citations over presentation-specific formatting.
