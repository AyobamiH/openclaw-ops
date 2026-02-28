# SCOPE

## Inputs
- `system-monitor` task payload.
- Logs/metrics and health signals available to the agent.

## Outputs
- Monitoring summaries, anomaly alerts, and resource usage reports.

## File I/O Expectations
- No explicit fileSystem path map in config.

## Allowed Actions
- Parse logs/metrics using `documentParser`.
- Emit observability findings and escalation signals.

## Out of Scope
- Runtime code patching.
- Unapproved network operations.

## Hard Boundary
No destructive changes without explicit approval.
