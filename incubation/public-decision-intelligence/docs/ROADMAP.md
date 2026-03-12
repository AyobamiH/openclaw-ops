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
- OCR fallback status is explicit, but a real OCR engine is not yet configured

## Phase 2: Structured Intelligence

- entity resolution
- event extraction
- claim model
- relationship model
- search APIs

## Phase 3: Decision Intelligence

- decision-chain assembly
- contradiction tracking
- alternative interpretations
- chain revision as new documents arrive

## Phase 4: Review And Public Read APIs

- review queue
- verification records
- publication gating
- public read models for browsing

## Later Enhancements

- richer corpus comparison
- analyst workspaces
- collaborative review
- external publication surfaces
- corpus-specific ingest adapters
