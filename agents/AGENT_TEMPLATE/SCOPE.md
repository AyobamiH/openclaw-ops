# SCOPE

## Inputs
- Task payload defined by orchestrator task mapping.
- Agent-specific config from `agent.config.json`.

## Outputs
- Structured task result for orchestrator consumption.
- Optional artifacts only in allowed write paths.

## File I/O Expectations
- Read/write paths must match `permissions.fileSystem` in `agent.config.json`.
- If no filesystem permissions are declared, treat file I/O as none.

## Allowed Actions
- Perform only explicitly permitted skill calls.
- Produce auditable output with evidence references.

## Out of Scope
- Runtime code changes outside assigned task.
- Secret handling or external network calls unless explicitly allowed.

## Hard Boundary
No destructive changes without explicit approval.
