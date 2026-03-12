# Product Requirements Document

## Vision

Build a backend-first decision intelligence product that transforms public
document releases into structured, evidence-traceable explanations of how
important decisions formed.

## Users

- investigative journalists
- researchers
- public-interest analysts
- legal and inquiry observers
- internal reviewers maintaining evidence integrity

## Problems

- important decisions are scattered across hundreds of pages
- most users cannot connect fragments across documents and dates
- existing tools flatten evidence into summaries without provenance
- relationship and influence patterns are difficult to inspect manually

## Goals

- preserve every meaningful output as evidence-backed and citeable
- support iterative reconstruction as new documents arrive
- provide strong retrieval across documents, entities, events, claims, and
  decisions
- support review workflows so published intelligence is challenged before it is
  trusted

## Non-Goals

- generic chat over PDFs
- speculative narrative generation without traceability
- editorial publishing workflow in this first backend phase
- replacing human review for disputed or sensitive conclusions

## Functional Requirements

- ingest raw documents with checksum and lineage tracking
- parse source text with OCR fallback where needed
- chunk documents into stable citeable fragments
- resolve entities and mentions
- extract events and claims
- model relationships with evidence support
- assemble decision chains from precursor, deliberation, formal, outcome, and
  after-effect events
- expose search and retrieval APIs
- expose review and verification workflows

## Non-Functional Requirements

- provenance must survive every stage
- derived objects must support review and challenge states
- search must preserve evidence context, not detached blobs
- the system must scale from one corpus to many future releases
- the architecture must remain extractable from OpenClaw

## Constraints

- evidence integrity outranks convenience
- model output must never erase uncertainty
- source tampering and unsupported inference are primary trust risks
- frontend desires must not outrun backend truth structures

## Success Metrics

- every published claim has at least one stable citation
- every decision chain can show evidence and unresolved gaps
- entity and relationship retrieval remains explainable
- reviewers can challenge or reject unsupported derivations
- new document drops can refine existing chains without breaking prior lineage

## Phased Delivery

- **Phase 1**: ingestion, evidence ledger, document and chunk retrieval
- **Phase 2**: entities, events, claims, relationships
- **Phase 3**: decision-chain assembly and review workflows
- **Phase 4**: public read APIs and public browsing surfaces
