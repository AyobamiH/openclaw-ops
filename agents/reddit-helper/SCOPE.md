# SCOPE

## Inputs
- `reddit-response` task payloads or queue instructions.
- Latest pack path referenced by `knowledgePackDir` in `agent.config.json`.
- Runtime context referenced by `orchestratorStatePath` in `agent.config.json`.

## Outputs
- Draft replies written via `draftLogPath` in `agent.config.json`.
- Optional Devvit queue entries written via `devvitQueuePath`.
- Service state updates written via `serviceStatePath`.

## File I/O Expectations
- Reads are governed by config keys: `knowledgePackDir`, `orchestratorStatePath`.
- Writes are governed by config keys: `draftLogPath`, `devvitQueuePath`, `serviceStatePath`, `orchestratorStatePath`.

## Allowed Actions
- Compose response drafts from current knowledge pack context.
- Emit confidence-based escalation hints.

## Out of Scope
- Runtime moderation automation outside configured channels.
- Unscoped repo cleanup recommendations.

## Hard Boundary
No destructive changes without explicit approval.
