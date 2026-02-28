# SCOPE

## Inputs
- `security-audit` task payload.
- Security configs/docs available locally.

## Outputs
- Security findings report with evidence and remediation steps.

## File I/O Expectations
- No explicit fileSystem path map in config.

## Allowed Actions
- Parse policy/config docs with `documentParser`.
- Normalize findings with `normalizer`.

## Out of Scope
- Network actions (disabled in config).
- Code patching and runtime deployment changes.

## Hard Boundary
No destructive changes without explicit approval.
