# SCOPE

## Inputs
- `content-generate` task payload.
- Source documents/code parsed through `documentParser`.

## Outputs
- Generated docs/content artifacts.
- Coverage/completeness notes when requested.

## File I/O Expectations
- No explicit fileSystem permissions declared; treat writes as task-scoped artifacts only.

## Allowed Actions
- Parse source docs/code with `documentParser`.
- Produce readme/docs/spec text from provided evidence.

## Out of Scope
- Live web research or network scraping.
- Code patching and test execution.

## Hard Boundary
No destructive changes without explicit approval.
