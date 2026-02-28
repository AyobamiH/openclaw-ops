# SCOPE

## Inputs
- `skill-audit` task payload.
- Skill source/docs and test targets.

## Outputs
- Skill audit report with test outcomes and compliance findings.

## File I/O Expectations
- No explicit fileSystem path map in config.

## Allowed Actions
- Run skill tests via `testRunner`.
- Parse skill docs/code via `documentParser`.

## Out of Scope
- Runtime deployment changes.
- Network calls.

## Hard Boundary
No destructive changes without explicit approval.
