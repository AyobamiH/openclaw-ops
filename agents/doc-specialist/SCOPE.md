# SCOPE

## Inputs
- `drift-repair` task payloads.
- Documentation sources referenced by `docsPath` and `cookbookPath` in `agent.config.json`.
- Runtime context referenced by `orchestratorStatePath` in `agent.config.json`.

## Outputs
- Knowledge pack artifacts written via `knowledgePackDir` in `agent.config.json`.
- Service/orchestrator state updates via `serviceStatePath` and `orchestratorStatePath`.

## File I/O Expectations
- Reads are governed by config keys: `docsPath`, `cookbookPath`, `orchestratorStatePath`.
- Writes are governed by config keys: `knowledgePackDir`, `serviceStatePath`, `orchestratorStatePath`.

## Allowed Actions
- Build pack artifacts from specified docs.
- Emit completion/error telemetry and state updates.

## Out of Scope
- Reddit posting and community reply composition.
- Unscoped repository cleanup actions.

## Hard Boundary
No destructive changes without explicit approval.
