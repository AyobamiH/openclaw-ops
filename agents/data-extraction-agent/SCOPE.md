# SCOPE

## Inputs
- `data-extraction` task payload.
- Local files in `workspace`.

## Outputs
- Structured extraction artifacts under `artifacts/extracted`.
- Extraction status and error details.

## File I/O Expectations
- Read paths: `workspace`.
- Write paths: `artifacts/extracted`.

## Allowed Actions
- Parse documents with `documentParser`.
- Normalize extracted data with `normalizer`.

## Out of Scope
- Source fetch and remote ingestion.
- Workspace patching and test execution.

## Hard Boundary
No destructive changes without explicit approval.
