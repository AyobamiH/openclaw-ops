# Public Decision Intelligence Source Boundary

This directory now contains the first implemented backend runtime for the
Public Decision Intelligence Platform.

Expected future modules include:

- corpus ingestion
- evidence ledger
- entity resolution
- event extraction
- claim modeling
- relationship modeling
- decision-chain assembly
- review and verification workflows
- public read APIs

Implemented Phase 1 modules now cover:

- service bootstrap (`app.ts`, `index.ts`)
- environment/config loading
- filesystem evidence ledger
- filesystem object storage copy
- local-path ingest service with checksum and version lineage
- inline source parsing
- chunk and citation generation
- Phase 1 document APIs

When implementation begins here, keep the source tree extraction-friendly:

- do not import deep OpenClaw internals casually
- prefer explicit adapters to platform capabilities
- keep domain objects and contracts local to this subtree
