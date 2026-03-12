# Review And Verification

## Why Review Exists

This product handles trust-sensitive intelligence. Extraction alone is not
enough.

Review exists to prevent:

- unsupported conclusions
- unresolved contradictions being published as settled
- inference being mistaken for direct proof

## Review Stages

- `under_review`: awaiting human or policy review
- `verified`: accepted as sufficiently supported
- `challenged`: concerns raised against the current form
- `rejected`: not supportable in current form
- `published`: approved for external consumption

## Reviewer Role

Reviewers should be able to inspect:

- source citations
- evidence class
- extraction rationale
- contradictions
- upstream/downstream dependencies

## Contradiction Handling

Contradictions should not be hidden.

The system must preserve:

- contradicting objects
- the evidence supporting each side
- review notes explaining why one path was preferred or left unresolved

## Verification Scope

Verification may apply to:

- a claim
- a relationship
- an event
- a decision-chain step
- a whole decision chain

## Publication Gate

Nothing should become public-facing unless its review state and evidence posture
support publication.

## Current Incubation Implementation

The current Phase 4 implementation provides:

- a review queue spanning claims, relationships, events, and decision chains
- persistent review records with reviewer, notes, prior state, and resulting
  state
- explicit dispositions:
  - `verify`
  - `challenge`
  - `reject`
  - `publish`
- publication gating on decision chains
- a public browse mode that prefers published chains but can fall back to
  transparent preview mode when nothing has been published yet
