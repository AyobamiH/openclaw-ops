# SCOPE

## Inputs
- `summarize-content` task payload.
- Source text/documents for summarization.

## Outputs
- Summary text and compression metadata.

## File I/O Expectations
- No explicit fileSystem path map in config.

## Allowed Actions
- Parse source docs with `documentParser`.
- Normalize extracted text with `normalizer`.

## Out of Scope
- External web retrieval.
- Source content rewriting beyond summarization request.

## Hard Boundary
No destructive changes without explicit approval.
