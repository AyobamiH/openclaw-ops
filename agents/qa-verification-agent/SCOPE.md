# SCOPE

## Inputs
- `qa-verification` task payload.
- Test targets from `workspace` and prior artifacts.

## Outputs
- QA reports in `artifacts/qa-reports`.
- Pass/fail summaries and failure diagnostics.

## File I/O Expectations
- Read paths: `workspace`, `artifacts`.
- Write paths: `artifacts/qa-reports`.

## Allowed Actions
- Run tests with `testRunner`.
- Collect and summarize verification evidence.

## Out of Scope
- Direct refactoring or code patching.
- External network calls.

## Hard Boundary
No destructive changes without explicit approval.
