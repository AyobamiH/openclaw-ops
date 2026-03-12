# Public Decision Intelligence Platform

This directory is the bounded incubation area for the Public Decision
Intelligence Platform while it is being developed inside OpenClaw.

OpenClaw remains the platform. This subsystem is an application built on top of
that platform and is being shaped for later extraction into a separate
repository once the dependency boundary is proven.

## Product Purpose

The Public Decision Intelligence Platform transforms large public document
releases into structured, traceable decision intelligence.

It is designed to help users answer:

- what happened
- who was involved
- what evidence supports each claim
- how decisions formed over time

It is not being designed as a chatbot over PDFs or a generic summarizer. The
truth model is the product.

## Why Backend First

This subsystem is backend-first because evidence integrity constrains every
later surface:

- ingestion must preserve source identity
- chunking must preserve citation anchors
- extraction must separate evidence from inference
- review state must survive later corrections
- decision chains must remain reversible as new files arrive

Frontend work comes after the evidence and retrieval model are stable enough to
deserve public consumption.

## Stack Direction

The incubated backend scaffold uses:

- TypeScript
- Node.js
- Fastify
- PostgreSQL as the target extracted data store
- `pgvector`
- Drizzle ORM
- Zod validation
- Pino structured logging
- `pg-boss` for background jobs
- an S3-compatible object storage abstraction for source artifacts

This stack was chosen because it favors explicit schemas, evidence-preserving
storage, operational simplicity, and future extractability.

## Current Phase 1 Runtime Choice

The **implemented** Phase 1 runtime uses a filesystem-backed evidence ledger and
filesystem object storage so the subsystem can run end to end inside the
incubation tree without provisioning a separate Postgres stack first.

That does **not** replace the long-term extracted architecture. It provides a
concrete local runtime for:

- document ingest
- checksum and version lineage
- parsing and chunking
- stable citations
- document APIs

The target extracted storage stack remains PostgreSQL + `pgvector` + object
storage.

## Directory Map

- [`docs/`](./docs/README.md): domain documentation for the decision-intelligence product
- [`src/`](./src/README.md): backend scaffold shaped for later extraction
- [`.env.example`](./.env.example): local configuration template
- [`package.json`](./package.json): subsystem scripts and dependency contract

## What Belongs Here

Only domain-specific work should go here, such as:

- evidence-ledger models for public corpora
- entity, event, claim, relationship, and decision-chain models
- review workflows specific to publishable decision intelligence
- public read APIs and public investigation surfaces

## What Does Not Belong Here

Do not move generic OpenClaw platform capabilities here just because this
subsystem uses them.

Examples that should stay in platform/core unless later extracted cleanly:

- generic orchestration and agent runtime
- generic graph primitives
- generic verification and remediation infrastructure
- generic document indexing primitives

## Active Corpus Rule

This subsystem must stay corpus-agnostic.

The Mandelson files are a first serious input set, not the permanent product
identity. Any implementation that assumes one corpus too deeply is creating
extraction debt.

## Current Status

What exists now:

- incubation boundary and extraction policy
- backend-first domain docs
- implemented Phase 1 runtime:
  - local source ingest
  - checksum and version lineage
  - filesystem-backed evidence ledger
  - filesystem object storage copy
  - inline parsing for supported formats
  - stable chunk and citation persistence
  - document health/list/detail APIs
- implemented Phase 2 runtime:
  - entity extraction
  - event extraction
  - claim persistence
  - relationship persistence
  - grouped search APIs
- implemented Phase 3 runtime:
  - decision-chain assembly
  - staged chain summaries
  - gap detection
  - alternative interpretations
  - chain revision on new ingest
- implemented Phase 4 runtime:
  - review queue
  - review history
  - verification and publication state
  - public read APIs
  - thin public browse surface at `/browse`

## Real Corpus Validation

The incubation runtime has now been exercised against the first real
Mandelson corpus file:

- `V1_FINAL.pdf`
- parse status: `complete`
- OCR status: `not_needed`
- extracted output from a clean runtime:
  - `194` chunks
  - `194` citations
  - `463` entities
  - `188` events
  - `194` claims
  - `1050` relationships
  - `3` decision chains

That means the subsystem is already useful for real corpus ingest and browse,
not only synthetic fixtures. The current thin public surface stays in
`previewMode` until review/publication state is advanced, but the evidence and
decision-chain structures are now being derived from live source material.

## Corpus Drop Workflow

For the current incubation model, new corpus files can be placed directly under
this subtree and ingested through the local API:

1. place the source file under this subtree or another readable local path
2. boot the service with `npm run dev` or a built `dist/index.js`
3. call `POST /api/v1/documents/ingest` with:
   - `sourcePath`
   - `logicalSourceKey`
   - `sourceType`
   - `sourceCollection`
   - `title`
4. inspect:
   - `/api/v1/documents`
   - `/api/v1/decision-chains`
   - `/public/api/overview`
   - `/browse`

This is the working loop intended for the early Mandelson batches while the
workers and public browsing surface are still incubating.

What does not exist yet:

- background job orchestration beyond direct ingest
- extracted Postgres-backed storage
- analyst-grade review tooling beyond the API
- collaborative workflows
- a polished public frontend beyond the thin browse surface
