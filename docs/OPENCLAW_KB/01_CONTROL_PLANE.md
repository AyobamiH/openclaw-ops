# Control Plane Audit

Last updated: 2026-02-24

## Verified Control Graph

1. Boot: `orchestrator/src/index.ts::bootstrap()`
2. Queue registration: `queue.onProcess(...)`
3. Dispatch: `resolveTaskHandler(task)`
4. Execution:
   - Local state updates (`state.ts`)
   - Spawned agent jobs (`taskHandlers.ts`)
   - Persistence + alert + metrics integrations

## Mutation Authority

**Verified mutable state owners**
- `orchestrator/src/index.ts`: task history and lifecycle timestamps.
- `orchestrator/src/taskHandlers.ts`: domain queues (`pendingDocChanges`, `redditQueue`, `rssDrafts`, etc.).
- `orchestrator/src/state.ts`: persistence truncation/limits and write path.

**Invariant**
- All durable orchestrator state changes must flow through `saveState()` from orchestrator context.

## Scheduler Authorities

**Verified cron triggers**
- Nightly batch (`nightly-batch`)
- Morning digest (`send-digest`)
- 5-min heartbeat (`heartbeat`)

**Verified background loops**
- Heartbeat hang detection alert loop.
- Alert cleanup loop.
- Memory scheduler and knowledge integration startup hooks.

## Task-Type Authority (Verified)

- API task trigger allowlist (`TaskTriggerSchema`) and runtime dispatch map (`taskHandlers`) now align for canonical agent tasks, including `market-research`, `data-extraction`, `qa-verification`, and `skill-audit`.
- Agent config declarations for `orchestratorTask` now have matching control-plane routes for all declared canonical task types.

## Control Plane Risks

- **R1**: Missing queue-level allowlist in `TaskQueue.enqueue()` means non-API internal callsites can enqueue arbitrary string task types.
- **R2**: Fallback handler returns success-like message for unknown task types (`no handler for task type ...`) instead of explicit reject path.
- **R3**: Control intent split across root compose + orchestrator compose + systemd service units can cause drift in active authority.

## Recommended Hardening

1. Add centralized allowed task enum in runtime (`taskHandlers` keys as source of truth) and reject unknown at enqueue boundary.
2. Make fallback handler return structured error and emit security/audit metric.
3. Enforce one deployment mode as canonical (compose or systemd) and mark alternates as emergency/debug only.
