---
title: "Public Decision Intelligence Boundary"
summary: "Incubation boundary for the Public Decision Intelligence Platform inside OpenClaw."
---

# Public Decision Intelligence Boundary

This document records the current decision for the Public Decision Intelligence
Platform:

- it is being incubated **inside** OpenClaw for now
- it is **not** being treated as the new identity of OpenClaw
- it is being structured so it can be extracted into a separate repository
  later with minimal rework

This is a product-boundary decision, not a temporary implementation accident.

## Why It Lives Inside OpenClaw For Now

OpenClaw already has a meaningful amount of the infrastructure the decision
intelligence product needs:

- agent orchestration
- ingestion and normalization agents
- knowledge indexing
- provenance, contradiction, freshness, and relationship graphs
- verification and remediation flows
- a private operator console

Building the first serious version inside OpenClaw lets the team discover the
true dependency boundary by implementing against a real corpus instead of
guessing the split too early.

The first corpus, such as the Mandelson files, is treated as a demanding input
set that validates the product model. It is not treated as the identity of the
platform.

## Why It Is Not Being Made A Separate Repo Yet

The current unknowns are still too important:

- which OpenClaw capabilities are genuinely reusable
- which parts belong only to decision intelligence
- how much of the graph, review, and evidence model is common versus domain
  specific
- what the public browsing product actually needs once a real corpus is loaded

Extracting too early would force the wrong boundary and likely duplicate or
discard useful infrastructure.

## Boundary Rules

While incubated inside OpenClaw, the Public Decision Intelligence Platform must
follow these rules.

### 1. Keep Domain Code Isolated

All decision-intelligence-specific work should live under a bounded subtree:

- `incubation/public-decision-intelligence/`

Do not scatter domain-specific assumptions throughout generic OpenClaw core
paths unless the capability is truly platform-level and reusable.

### 2. Keep Platform Concepts Generic

OpenClaw core remains responsible for reusable infrastructure such as:

- task orchestration
- agent execution
- knowledge indexing primitives
- verification plumbing
- remediation plumbing
- graph primitives
- generic search and retrieval foundations

Decision-intelligence-specific domain objects such as `DecisionChain`,
`EvidenceChunk`, `SourceCitation`, and corpus-specific public read models should
stay in the incubated subtree unless and until they are proven reusable.

### 3. Treat Corpora As Inputs, Not Identity

The Mandelson files are one corpus.

This incubation path must stay usable for:

- parliamentary returns
- government inquiries
- FOI disclosures
- committee evidence packs
- legal discovery files
- public corporate investigation documents

If code starts assuming one corpus shape too deeply, the boundary has been
crossed incorrectly.

### 4. Separate Evidence From Inference

This is non-negotiable.

Every meaningful output must preserve the distinction between:

- direct evidence
- inferred linkage
- disputed interpretation
- incomplete record

If that distinction becomes hard to maintain in an API or data model, the
design is drifting in the wrong direction.

## What Stays In OpenClaw Core

The following are currently considered OpenClaw-core candidates:

- generic ingestion scheduling and task dispatch
- extraction and normalization agent infrastructure
- graph primitives for provenance, workflow, relationship, and contradiction
- review, verification, and remediation infrastructure
- generic search/retrieval foundations
- generic operator-console infrastructure

These should remain reusable even if the decision-intelligence subsystem is
later extracted.

## What Belongs To The Incubated Subsystem

The following are currently considered application-specific and should be
incubated under the bounded subtree:

- decision-intelligence domain model
- evidence-ledger model for public corpora
- entity/event/claim/relationship/decision-chain assembly specific to this
  product
- public browsing APIs and public investigation UI
- corpus-specific ingest conventions
- review workflows specific to publishable decision intelligence

## Extraction Criteria

This subsystem should move to its own repo once these conditions are true:

1. the domain model is stable enough to stand on its own
2. the dependency list on OpenClaw core is explicit and small
3. the public browsing and review product has a clear user-facing contract
4. shared infrastructure can be named cleanly as reusable modules instead of
   copied ad hoc

Extraction should follow:

1. identify shared primitives that remain in OpenClaw or become shared packages
2. move domain code and docs from the incubated subtree into the new repo
3. preserve API and evidence contracts during cutover

## Initial Structure

The initial incubated structure is:

- `incubation/public-decision-intelligence/README.md`
- `incubation/public-decision-intelligence/docs/README.md`
- `incubation/public-decision-intelligence/src/README.md`

This is intentionally small. The goal right now is to create a clean home and
document the boundary before more implementation lands.
