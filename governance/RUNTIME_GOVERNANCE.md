# Runtime Governance Policy (Proposed Baseline)

## Scope

Applies to orchestrator, spawned agents, skills, API gateway, and operational deployment units.

## Mandatory Controls

1. **Single dispatch authority**: all production task execution enters via orchestrator queue.
2. **Central permission gate**: orchestrator enforces agent->skill permissions before execution.
3. **Config coherence**: every `orchestratorTask` in agent configs must map to handler + trigger schema.
4. **Fail-closed unknown tasks**: reject and alert on unknown task type.
5. **Operational mode lock**: production runs one approved startup mode (compose OR systemd), documented.
6. **Auditability**: each task and skill invocation logs task id, agent id, input hash, result hash, timestamp.

## Governance Checks (CI)

- `config-map-check`: verify `agent.config.json` task mapping coherence.
- `runtime-control-check`: ensure `toolGate` and `skillAudit` modules exist and are wired.
- `api-protection-check`: ensure protected endpoints include auth + limiter + validation middleware.
- `deployment-drift-check`: detect unapproved executable units (systemd/compose overlap policy).

## Decision Rights

- Human operator approves permission expansion and irreversible actions.
- Agent code cannot self-grant new skills, network domains, or write scopes.
