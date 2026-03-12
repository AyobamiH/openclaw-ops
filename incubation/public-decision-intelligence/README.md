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

What does not exist yet:

- background job orchestration beyond direct Phase 1 ingest
- extracted Postgres-backed storage
- entity/event/claim/relationship services
- real review workflows
- public browsing frontend
