# Control Plane Audit

Last reviewed: 2026-03-07

## Current Control Graph

1. Runtime bootstraps in `orchestrator/src/index.ts`.
2. Task listeners are attached to `TaskQueue`.
3. `TaskQueue.enqueue()` rejects non-allowlisted task types before they are
   queued.
4. `resolveTaskHandler(task)` maps the task to a concrete handler.
5. The handler runs inline logic or a spawned-agent job, updates runtime state,
   and persists through orchestrator save paths.

This is the current canonical flow for orchestrator-managed execution.

Bypass note:

- Direct task entrypoints and standalone long-running services still exist as
  controlled exception surfaces. They should be treated as bypasses relative to
  the orchestrator-first path, not as proof that the queue is optional.

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
  `qa-verification`, `skill-audit`), but this public schema is narrower than
  the internal runtime allowlist.
- For non-technical operators, `TaskTriggerSchema` is the supported task
  surface. The broader internal allowlist should not be presented as the same
  thing as the public task menu.
- `startup` and `doc-change` are internal-only paths even though they exist in
  the internal allowlist.
- `unknownTaskHandler` now throws an explicit error rather than returning a
  success-like fallback message.
- Approval-gated replay behavior is active runtime behavior: approval-required
  tasks are held pending, then re-enqueued on approval with
  `approvedFromTaskId` to satisfy gate checks.

## Control Plane Strengths

- Task intake is now deny-by-default at both API and queue layers.
- Spawned-agent task handlers perform tool-gate preflight checks before running.
- The active control plane can emit milestones for meaningful runtime events,
  which improves external visibility into state changes.
- Retryable tasks now persist a `taskRetryRecoveries` recovery queue through the
  existing orchestrator state path, so restart can requeue real retry work
  instead of only failing it honestly.
- The control plane now has a first-class, bounded self-healing evidence model:
  `repairRecords` in orchestrator state, `/api/dashboard/overview.selfHealing`,
  `/api/health/extended.repairs`, and per-run `repair` metadata on
  `/api/tasks/runs` / `/api/tasks/runs/:runId`.
- The first live repair loop is now evidence-backed rather than aspirational:
  doc drift can be detected internally, routed to `drift-repair`, verified by
  knowledge-pack output, and recorded as a bounded repair event.
- The protected `/api/dashboard/overview` surface is the operator visibility
  surface for queue depth, pending approvals, governance summary, and recent
  tasks. It is protected operator aggregation, not authoritative system health,
  and it is not a public proof/community surface.
- The authoritative protected operator-health route is
  `/api/health/extended`; it is the route that keeps routing truth separate
  from dependency degradation.
- Task capability and run visibility now have dedicated protected surfaces:
  - `/api/tasks/catalog` (classification + telemetry overlay),
  - `/api/tasks/runs` and `/api/tasks/runs/:runId` (first-class run detail).
- Agent inventory truth now includes declared/worker/service status evidence via
  `/api/agents/overview` rather than a manifest-only view.
- Governed-skill APIs for frontend/operator use remain read-only visibility
  surfaces (`GET /api/skills/*`), while execution remains on task/approval
  workflows.
- Protected endpoints now enforce server-side RBAC (`viewer`, `operator`,
  `admin`) with deny-by-default route gating and audit context.
- Operational truth for that surface is live-state truth, not an aspirational
  capability list. It should be read as "what the control plane can currently
  see," not "what every downstream task path is guaranteed to complete."

## Operator Station Route Contract

- `GET /api/health/extended`: authoritative protected operator-health route.
- `GET /api/dashboard/overview`: protected operator aggregation only; useful
  for queue/approval/governance visibility, but not system-status authority.
- `GET /health`: shallow public liveness only. It can stay `healthy` while
  `/api/health/extended` reports degraded dependencies.
- `GET /api/persistence/health`: public persistence dependency truth only.
- `GET /api/auth/me`: protected auth identity surface.
- `/system-health`: not a backend route; it is a frontend-only page path.

## Operational Interpretation Guardrail

- Control-plane routing success is not equivalent to downstream task success.
- A task can be accepted by `/api/tasks/trigger`, pass allowlist checks, and
  still be partially operational if downstream dependencies are degraded.
- Approval replay success is also a separate claim from downstream completion
  success.
- `/api/dashboard/overview` success is not the same claim as authoritative
  health success; it is an aggregation surface and can coexist with degraded
  dependency truth from `/api/health/extended`.
- Self-healing status is also a separate claim: a repair can be detected,
  queued, and verified while the overall dependency plane remains degraded.
- For spawned-worker confidence, the `2026-03-07` sweep needed four evidence
  surfaces together: route acceptance, ToolGate audit, task-run detail, and
  per-agent memory recall.
- In that same sweep, `/api/agents/overview` memory fields reflected the
  successful runs, but `workerValidationStatus` could still lag the latest live
  run evidence until the overview logic consumed those evidence sources.
- The `2026-03-07` repair follow-up added a fifth evidence surface for repair
  claims: tracked `repair` metadata on run detail plus the aggregated repair
  summaries in `/api/dashboard/overview` and `/api/health/extended`.
- Operational status language must separate:
  - intake/routing truth,
  - approval-gate truth,
  - downstream dependency truth.

## Current Risks

- The repo still exposes multiple deployment surfaces (root compose,
  orchestrator compose, and systemd units), which means operational authority
  can drift if teams use different launch paths.
- Standalone agent services still exist, so orchestrator-first routing remains
  the intended model, not an exclusive enforcement boundary.
- Child-process spawn paths now use an allowlisted environment, but they are
  still not sandboxed and do not enforce manifest-declared network/filesystem
  policy at runtime.
- Retrying task executions now have a persisted recovery queue and can be
  requeued after restart, but the path is still partial and should not be
  described as an exactly-once replay guarantee.

## Recommended Hardening

1. Keep the runtime allowlist as the single source of truth and test it against
   API schema drift.
2. Treat standalone service units as an exception path, not the normal control
   plane.
3. Keep tightening spawned-job containment beyond the current env allowlist so
   control-plane policy is backed by stronger runtime isolation.
4. Keep future skill execution on a governed path: registration, declared
   permissions, audit, and explicit orchestrator-aware execution before a skill
   is treated as trusted.
