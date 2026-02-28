# OpenClaw Runtime Truth (Current)

Last reviewed: 2026-02-28
Scope: Current runtime architecture and governance controls verified from the
active codebase.

## 1) Canonical Control Plane

Verified:

- `orchestrator/src/index.ts` remains the main runtime bootstrap for the
  orchestrator HTTP/API surface.
- Task execution enters through `TaskQueue.enqueue()` in
  `orchestrator/src/taskQueue.ts`.
- Queue dispatch resolves through `resolveTaskHandler()` in
  `orchestrator/src/taskHandlers.ts`.
- Task intake is deny-by-default at both schema and queue boundaries:
  `TaskTriggerSchema` limits API-triggered types, and `validateTaskType()`
  rejects invalid queue entries.

Operational reality:

- The orchestrator is the canonical control plane, but it is not the only
  executable surface in the repo because standalone agent systemd units still
  exist.

## 2) Runtime Dispatch Model

Verified:

- The canonical task allowlist currently includes:
  `startup`, `doc-change`, `doc-sync`, `drift-repair`, `reddit-response`,
  `security-audit`, `summarize-content`, `system-monitor`, `build-refactor`,
  `content-generate`, `integration-workflow`, `normalize-data`,
  `market-research`, `data-extraction`, `qa-verification`, `skill-audit`,
  `rss-sweep`, `nightly-batch`, `send-digest`, `heartbeat`, and `agent-deploy`.
- Invalid task types hard-fail. `TaskQueue.enqueue()` throws on invalid types,
  and `unknownTaskHandler` throws if a non-allowlisted task reaches handler
  resolution.
- Most specialized task flows execute through `runSpawnedAgentJob()` using
  payload/result files.
- `drift-repair` and `reddit-response` use dedicated wrappers
  (`runDocSpecialistJob()` and `runRedditHelperJob()`) but still flow through
  orchestrator task handling.
- The active spawned-agent result contract remains
  `operations/AGENT_EXECUTION_CONTRACT.md`.

## 3) Security and Policy Gates

Verified:

- Bearer token, webhook HMAC, request validation, and rate limiting remain part
  of the orchestrator middleware stack.
- `orchestrator/src/toolGate.ts` now exists and is used as a real preflight
  authorization layer.
- `orchestrator/src/skillAudit.ts` now exists and is used by `skills/index.ts`
  when the skill registry is initialized.
- `taskHandlers.ts` performs tool-gate preflight checks before spawned-agent
  tasks run.

Current limitation:

- ToolGate currently enforces allowlist checks and records invocation intent,
  but it is not a full host-level sandbox. Child processes still run with
  process-level privileges unless tighter isolation is added elsewhere.

## 4) State, Memory, and Output Surfaces

Verified:

- `orchestrator_state.json` remains the primary local state file.
- Per-agent service memory is still persisted via configured `serviceStatePath`
  values.
- Additional outputs exist across logs/artifacts and optional persistence
  integrations.
- The orchestrator emits milestones through `getMilestoneEmitter()` for runtime
  and pipeline state changes.

## 5) Deployment Reality

Verified:

- Two compose surfaces still exist: the repo root compose and
  `orchestrator/docker-compose.yml`.
- systemd unit files exist for the orchestrator and multiple agent services,
  including `doc-specialist`, `reddit-helper`, and other task agents.

Risk implication:

- The intended governance boundary is orchestrator-first, but operators can
  still run agent services outside the queue path if they choose to use the
  standalone service layer.
