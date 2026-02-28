# SCOPE

## Inputs
- `integration-workflow` task payloads.
- Workflow specs and intermediate data.

## Outputs
- Workflow execution summary.
- Normalized handoff payloads and error reports.

## File I/O Expectations
- No explicit fileSystem read/write path declarations in config.

## Allowed Actions
- Parse workflow definitions with `documentParser`.
- Normalize inter-step data with `normalizer`.

## Out of Scope
- Direct code patching and test execution.
- External web calls.

## Hard Boundary
No destructive changes without explicit approval.
