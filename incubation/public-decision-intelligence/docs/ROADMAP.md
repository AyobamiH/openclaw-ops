# Roadmap

## Phase 1: Evidence Foundation

- source ingest
- checksums and version lineage
- parse and OCR fallback
- stable chunk and citation model
- document APIs

Current incubation implementation status:

- implemented end to end with a filesystem ledger and filesystem object storage
- live-validated locally through `POST /api/v1/documents/ingest`,
  `GET /api/v1/documents`, `GET /api/v1/documents/:documentId`, and `/health`
- text-based PDF extraction is now live in the incubation runtime
- the first real Mandelson volume has already been ingested successfully from a
  clean runtime and produces usable browse/search data
- OCR fallback status is explicit, but a real OCR engine is still not configured

## Phase 2: Structured Intelligence

- entity resolution
- event extraction
- claim model
- relationship model
- search APIs

Current incubation implementation status:

- implemented end to end with filesystem-backed structured intelligence persisted
  alongside documents, chunks, and citations
- entity, event, claim, and relationship routes are now live within `/api/v1`
- search groups preserve evidence context instead of returning detached text hits
- decision chains and review remain later phases, but Phase 2 now provides the
  structured substrate they depend on

## Phase 3: Decision Intelligence

- decision-chain assembly
- contradiction tracking
- alternative interpretations
- chain revision as new documents arrive

Current incubation implementation status:

- implemented end to end with deterministic chain assembly from structured
  evidence
- each chain now exposes stage buckets, gap records, alternative
  interpretations, revision count, and verification/publication state
- contradiction handling is still lightweight and rule-based; deeper
  contradiction reasoning remains later work

## Phase 4: Review And Public Read APIs

- review queue
- verification records
- publication gating
- public read models for browsing

Current incubation implementation status:

- implemented end to end with:
  - review queue
  - review history
  - target-level review actions
  - publication state on decision chains
  - public read APIs
  - thin public browse surface at `/browse`

## Later Enhancements

- richer corpus comparison
- analyst workspaces
- collaborative review
- external publication surfaces
- corpus-specific ingest adapters
