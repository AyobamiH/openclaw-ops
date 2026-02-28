# SCOPE

## Inputs
- `normalize-data` task payload.
- Raw records/documents provided by upstream steps.

## Outputs
- Normalized datasets and validation summaries.

## File I/O Expectations
- No explicit read/write path declarations in config.

## Allowed Actions
- Normalize records with `normalizer`.
- Parse structured/unstructured inputs with `documentParser`.

## Out of Scope
- Network calls and web retrieval.
- Test execution and workspace patching.

## Hard Boundary
No destructive changes without explicit approval.
