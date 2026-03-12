# Ingestion Pipeline

## End-To-End Flow

1. receive raw source artifact
2. assign or validate logical source key for lineage
3. compute checksum and source identity metadata
4. store original file in object storage
5. create document record and ingest audit record
6. enqueue parse job or run parse inline in the incubation runtime
7. parse native text, extract PDF text where available, or invoke OCR fallback
8. normalize text and page/anchor metadata
9. chunk into citeable evidence fragments
10. persist chunks and citations
11. enqueue downstream extraction jobs for entities, events, claims, and
    relationships

## Source Integrity

Every ingest must record:

- checksum
- file size
- logical source key
- source collection
- original filename
- ingest timestamp
- operator or automated source

If a file changes but shares a logical identity, it becomes a new version in the
same version group rather than silently replacing the old one.

## OCR Fallback

OCR should only run when:

- native extraction fails
- the document is image-based
- the extracted text fails minimum coverage thresholds

OCR artifacts should be stored as derived objects, not treated as original
source.

In the current incubation runtime:

- text PDFs are extracted directly into per-page evidence blocks
- image-only or extraction-failure cases should still be marked explicitly as
  `not_configured` rather than silently claiming OCR success
- the first real Mandelson volume (`V1_FINAL.pdf`) has been live-validated
  through this path and currently yields:
  - `194` chunks
  - `194` citations
  - `463` entities
  - `188` events
  - `194` claims
  - `1050` relationships
  - `3` decision chains after downstream extraction/rebuild

## Chunking Strategy

Chunks must optimize for:

- citeability
- retrieval quality
- stable anchors
- review ergonomics

Chunks should preserve page ranges, local offsets, and enough surrounding
context to stand alone in search results.

## Metadata Extraction

During or immediately after parsing, collect:

- dates
- detected participants
- document type
- possible organizations or committees
- publication context

These are hints, not final truth.

## Failure Handling

The pipeline must preserve explicit failure states:

- ingest failed
- storage failed
- parse failed
- OCR failed
- chunking failed
- downstream extraction failed

Failures should not destroy partial provenance records. They should create
retriable, inspectable job states.

## Incubation Runtime Note

The current Phase 1 runtime executes ingest inline on the API path rather than
through a separate job worker. That is intentional for incubation speed and
end-to-end validation. The extracted architecture should move parse and
downstream extraction back onto background jobs.
