# Agent Isolation and Dispatch Boundaries

Last reviewed: 2026-02-28

## Current Isolation Facts

- The orchestrator still runs most task agents as short-lived child processes.
- `drift-repair` and `reddit-response` also run through orchestrator-managed
  wrappers for `doc-specialist` and `reddit-helper`.
- The active task handlers now cover the broader agent set, including
  `market-research`, `data-extraction`, `qa-verification`, and `skill-audit`.
- ToolGate preflight now exists, so dispatch is no longer relying only on
  handler-local conventions.

## Current Coverage

The canonical task agents are now wired through the orchestrator task map:

- `security-agent`
- `summarization-agent`
- `system-monitor-agent`
- `build-refactor-agent`
- `content-agent`
- `integration-agent`
- `normalization-agent`
- `market-research-agent`
- `data-extraction-agent`
- `qa-verification-agent`
- `skill-audit-agent`
- `doc-specialist`
- `reddit-helper`

That means the primary documented task-agent surface is now represented in the
runtime handler layer.

## Isolation Limits That Still Matter

1. ToolGate is an authorization layer, not a full process sandbox.
2. Child processes still inherit process-level environment unless filtered.
3. systemd service units exist for multiple agents, so direct execution remains
   possible outside the queue path.
4. Agent config schemas and maturity still vary between agents, even though the
   README layer is now normalized.

## Governance Rule

- Preferred execution path: orchestrator queue and handler dispatch.
- Standalone services should be treated as operational exceptions, maintenance
  paths, or explicitly controlled deployments, not as proof that isolation is
  fully centralized.

## Practical Hardening

1. Reduce secret inheritance for spawned agents.
2. Keep task-to-agent mapping tests aligned with `agent.config.json`.
3. Treat systemd direct-run paths as a documented exception and review them with
   the same rigor as the orchestrator path.
