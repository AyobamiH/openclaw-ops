# Search And Retrieval

## Retrieval Philosophy

Retrieval must preserve evidence context.

The system should never return detached text blobs without clear linkage to:

- document identity
- citation anchors
- related entities or events
- review state

## Query Types

- keyword
- entity
- date range
- document collection
- event type
- decision subject
- hybrid keyword plus semantic retrieval

## Retrieval Units

The primary retrieval units are:

- documents
- evidence chunks
- claims
- entities
- events
- decision chains

## Ranking Principles

Ranking should balance:

- textual relevance
- citation density
- review state
- evidence directness
- recency where appropriate

## Result Presentation Contract

Every result should carry enough metadata for later frontend use:

- stable ID
- title or summary
- citation excerpt or support count
- document/date context
- review/evidence status
