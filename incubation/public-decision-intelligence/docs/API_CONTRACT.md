# API Contract

## Versioning

The initial contract is namespaced under `/api/v1`.

## Documents

- `POST /api/v1/documents/ingest`
  - ingest a local source file into the evidence ledger
  - request includes source path, logical source key, source collection, source
    type, and optional publication metadata
  - response includes checksum, version lineage, parse status, chunk count,
    citation count, entity count, event count, claim count, and relationship
    count
- `GET /api/v1/documents`
  - list documents with metadata, ingest status, source collection, and version
    lineage
- `GET /api/v1/documents/:documentId`
  - return document metadata, parse status, related chunks, and citation
    availability
  - also returns extracted entities, mentions, events, claims, and
    relationships for the document

## Claims

- `GET /api/v1/claims`
  - list claims with lifecycle state, evidence class, and review state
  - supports filtering by `documentId`, `evidenceClass`, and `lifecycleState`
- `GET /api/v1/claims/:claimId`
  - return the claim text, supporting citations, contradictions, and review
    history

## Entities

- `GET /api/v1/entities`
  - list canonical entities with counts, aliases, and role hints
  - supports filtering by `entityType` and `q`
- `GET /api/v1/entities/:entityId`
  - return mentions, linked events, linked relationships, and linked decisions

## Events

- `GET /api/v1/events`
  - list events by type, date, and review state
  - supports filtering by `eventType`, `documentId`, and `entityId`
- `GET /api/v1/events/:eventId`
  - return event summary, participating entities, citations, and linked claims

## Relationships

- `GET /api/v1/relationships`
  - list structured relationships derived from cited evidence
  - supports filtering by `predicate`, `documentId`, and `entityId`
- `GET /api/v1/relationships/:relationshipId`
  - return subject/object/event/citation context for a single relationship

## Decision Chains

- `GET /api/v1/decision-chains`
  - list reconstructed decisions with summary, confidence, and stage coverage
  - supports filtering by `sourceCollection`, `status`, and `subject`
- `GET /api/v1/decision-chains/:decisionChainId`
  - return structured stages, citations, alternative interpretations, and gaps

## Search

- `POST /api/v1/search`
  - accept keyword, entity, date, event type, and decision filters
  - supports `query`, `entityType`, `eventType`, `documentId`,
    `sourceCollection`, `predicate`, `dateFrom`, and `dateTo`
  - returns grouped results that preserve evidence context for documents,
    entities, events, claims, and relationships

## Review

- `GET /api/v1/review/queue`
  - return items awaiting review or challenge
- `GET /api/v1/review/history`
  - return review records filtered by target type and/or target ID
- `POST /api/v1/review/:targetType/:targetId`
  - submit a review disposition with reasoning and evidence notes
  - supported target types:
    - `claim`
    - `relationship`
    - `event`
    - `decision_chain`

## Public Read

- `GET /browse`
  - serve the thin public browse surface
- `GET /public/api/overview`
  - summary counts, latest documents, and visible featured chains
  - featured chains include `stageCount`, `gapCount`, `publicationStatus`,
    and `lastUpdated`
  - this is the fastest endpoint for checking whether a newly dropped corpus
    file produced usable browse data after ingest
- `GET /public/api/documents`
  - public document library
- `GET /public/api/documents/:documentId`
  - public document detail with chunks, citations, and related visible chains
- `GET /public/api/entities`
  - public entity index
  - entity projections include `firstSeenAt`, `lastSeenAt`, and
    `linkedChainCount`
- `GET /public/api/entities/:entityId`
  - public entity detail with visible chain links
- `GET /public/api/decision-chains`
  - visible decision chains; defaults to published chains, or preview chains if
    nothing has been published yet
  - list items include `stageCount`, `gapCount`, `publicationStatus`, and
    `lastUpdated`
- `GET /public/api/decision-chains/:decisionChainId`
  - public/preview decision-chain detail
- `POST /public/api/search`
  - public grouped search across documents, entities, events, claims,
    relationships, and visible decision chains

## Health / Admin

- `GET /health`
  - liveness and startup posture
- `GET /api/v1/admin/ingestion/jobs`
  - ingestion and extraction job visibility

The contract must remain evidence-first. Responses should prefer stable IDs,
lineage metadata, and citations over presentation-specific formatting. Public
read routes also emit CORS headers so a separately hosted browse frontend can
read them directly. Allowed origins are controlled by
`PUBLIC_API_ALLOWED_ORIGINS`, which accepts `*` or a comma-separated allowlist
of exact origins. The incubated local default allowlist includes the local
frontend preview origin and the Lovable preview hostname used for the public
browse frontend.
