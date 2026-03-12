# Architecture

## System Context

The subsystem sits inside OpenClaw during incubation, but should be designed as
an extractable backend product.

It has five major layers:

1. ingestion
2. evidence ledger
3. structured intelligence extraction
4. review and verification
5. read APIs and retrieval

## Service Boundaries

- **Ingestion service**: accepts raw source files, captures metadata, computes
  checksums, stores originals, and emits parse jobs
- **Parsing and chunking pipeline**: extracts normalized text and builds stable
  evidence chunks and citations
- **Intelligence extraction layer**: resolves entities, extracts events and
  claims, and builds relationship candidates
- **Decision assembly layer**: constructs and revises decision chains
- **Review layer**: tracks challenge, verification, rejection, and publication
  state
- **API layer**: exposes read and review surfaces to future frontend and admin
  tools

## Storage Choices

Target extracted architecture:

- **PostgreSQL**: canonical relational store for documents, chunks, entities,
  events, claims, relationships, decisions, reviews, and audits
- **pgvector**: semantic retrieval support over chunks and derived summaries
- **Object storage**: original source files, OCR artifacts, and extracted
  derivatives
- **Background jobs**: `pg-boss` to keep extraction and review orchestration
  close to the core data store

Current incubation runtime for implemented Phase 1:

- **Filesystem ledger**: JSON-backed ledger for document, chunk, and citation
  persistence
- **Filesystem object storage**: copied original source files stored under the
  incubated subtree

This is an intentional incubation runtime, not the long-term extracted storage
contract.

## Evidence Ledger

The evidence ledger is the backbone of the system.

It must:

- assign stable IDs to source files, chunks, and citations
- preserve original checksums and version lineage
- track which derived objects cite which source fragments
- preserve evidence class and confidence provenance

## Search Layer

Search must support:

- keyword search
- entity-centric search
- date filtering
- event-type filtering
- decision-chain retrieval
- hybrid keyword plus vector retrieval

Search responses must preserve citation context and document lineage.

## Review / Verification Layer

Derived objects are not automatically trusted.

Review state is required for:

- claims
- relationships
- decision chains
- publication candidates

Review objects must capture reviewer identity, disposition, reasoning, and
 linked evidence.

## API Layer

The API should remain versioned and backend-first.

Initial route groups:

- `/api/v1/documents`
- `/api/v1/entities`
- `/api/v1/events`
- `/api/v1/claims`
- `/api/v1/decision-chains`
- `/api/v1/search`
- `/api/v1/review`

## Operational Considerations

- audit logs must exist for ingestion, review, and publication changes
- source integrity and tamper evidence are mandatory
- extraction must be replayable when parsing or normalization improves
- the architecture must tolerate incomplete and contradictory records
