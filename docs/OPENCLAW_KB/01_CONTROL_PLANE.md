# Control Plane Audit

Last reviewed: 2026-02-28

## Current Control Graph

1. Runtime bootstraps in `orchestrator/src/index.ts`.
2. Task listeners are attached to `TaskQueue`.
3. `TaskQueue.enqueue()` rejects non-allowlisted task types before they are
   queued.
4. `resolveTaskHandler(task)` maps the task to a concrete handler.
5. The handler runs inline logic or a spawned-agent job, updates runtime state,
   and persists through orchestrator save paths.

This is the current canonical flow for orchestrator-managed execution.

## Mutation Authority

Primary mutable owners remain:

- `orchestrator/src/index.ts` for top-level lifecycle and task recording
- `orchestrator/src/taskHandlers.ts` for domain queues and task-driven state
  mutation
- `orchestrator/src/state.ts` for durable state serialization, bounding, and
  persistence helpers

Current invariant:

- Durable orchestrator state is still expected to flow through the orchestrator
  save path rather than ad hoc writes.

## Task-Type Authority

Verified:

- `ALLOWED_TASK_TYPES` in `taskHandlers.ts` is the canonical runtime allowlist.
- `TaskQueue.enqueue()` now imports that allowlist and rejects invalid types at
  queue entry.
- `TaskTriggerSchema` covers the API-triggerable task surface and includes the
  newer agent task types (`market-research`, `data-extraction`,
  `qa-verification`, `skill-audit`).
- `unknownTaskHandler` now throws an explicit error rather than returning a
  success-like fallback message.

## Control Plane Strengths

- Task intake is now deny-by-default at both API and queue layers.
- Spawned-agent task handlers perform tool-gate preflight checks before running.
- The active control plane can emit milestones for meaningful runtime events,
  which improves external visibility into state changes.

## Current Risks

- The repo still exposes multiple deployment surfaces (root compose,
  orchestrator compose, and systemd units), which means operational authority
  can drift if teams use different launch paths.
- Standalone agent services still exist, so orchestrator-first routing remains
  the intended model, not an exclusive enforcement boundary.
- Child-process spawn paths still inherit process-level environment unless
  explicitly filtered.

## Recommended Hardening

1. Keep the runtime allowlist as the single source of truth and test it against
   API schema drift.
2. Treat standalone service units as an exception path, not the normal control
   plane.
3. Reduce environment inheritance for spawned jobs so control-plane policy is
   backed by tighter process isolation.
