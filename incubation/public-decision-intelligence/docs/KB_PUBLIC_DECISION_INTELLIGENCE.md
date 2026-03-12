# Public Decision Intelligence Knowledge Base

The Public Decision Intelligence Platform is a backend-first system for turning
large public evidence bundles into structured decision intelligence.

It is designed for corpora such as:

- parliamentary returns
- government inquiries
- FOI disclosures
- committee evidence packs
- legal discovery files
- public corporate investigation records

The product does not aim to be a chatbot over documents. It aims to become a
trust-sensitive evidence engine that supports retrieval, review, and
decision-chain reconstruction.

## Core Domain Language

- **Document**: an ingested source artifact with identity, provenance, checksum,
  and version lineage
- **Evidence Chunk**: a citeable fragment of a source with stable anchors
- **Entity**: a canonical person, organization, committee, department, role, or
  location
- **Entity Mention**: a document-level reference to a candidate or canonical
  entity
- **Event**: a structured occurrence such as a meeting, recommendation,
  objection, approval, announcement, or statement
- **Claim**: a factual statement supported by one or more evidence chunks
- **Relationship**: a structured link between entities, or between entities and
  events, supported by evidence
- **Decision Chain**: an evidence-backed sequence showing how a material outcome
  formed
- **Source Citation**: a stable locator into the original source material
- **Review Record**: a record of whether a derived object has been reviewed,
  challenged, verified, rejected, or left unresolved

## Evidence Philosophy

Every meaningful output must remain traceable to source evidence.

The platform must preserve:

- provenance
- stable citation anchors
- supporting excerpts
- evidence classification
- review state
- version lineage

The system must separate:

- direct evidence
- inferred linkages
- disputed interpretations
- incomplete records

## User Value

This system should let a serious user answer:

- what happened
- who was involved
- how the relevant process unfolded
- which evidence supports a claim
- where uncertainty still remains

It should reduce time spent reading fragmented documents while increasing trust
in how conclusions were formed.

## Long-Term Role

Long term, this subsystem should become:

- an evidence engine
- a public intelligence archive
- a decision-chain reconstruction system
- an influence and relationship mapping backend
- a source-backed retrieval platform

It is being incubated inside OpenClaw because the platform already provides
relevant orchestration, graph, review, and agent infrastructure. It is not
being treated as synonymous with OpenClaw itself.
