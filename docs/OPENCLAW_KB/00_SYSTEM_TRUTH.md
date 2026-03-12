# OpenClaw Runtime Truth (Current)

Last reviewed: 2026-03-02
Scope: Current runtime architecture and governance controls verified from the
active codebase.

Authority order: runtime code first, then canonical anchors, then supporting
docs, then historical snapshots.

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
- Bearer token comparison now uses a constant-time byte comparison path.
- `orchestrator/src/toolGate.ts` now exists and is used as a real preflight
  authorization layer.
- `orchestrator/src/skillAudit.ts` now exists as a protected governance
  surface, but active runtime should still describe it as a partial or deferred
  integration layer unless a specific call path is proven.
- `taskHandlers.ts` performs tool-gate preflight checks before spawned-agent
  tasks run.
- `openclawdbot` now fails closed for signed bootstrap content when the Redis
  signing secret is missing, and internal mutating route groups are explicitly
  context-gated.

Current limitation:

- ToolGate currently enforces allowlist checks and records invocation intent
  through explicit preflight calls (`preflightSkillAccess()`; legacy
  `executeSkill()` remains a compatibility alias), but it is not a full
  host-level sandbox. Child processes now run with an allowlisted
  environment, but they still do not have host-level sandboxing.
- Manifest skill allowlists are partially enforced in runtime. Manifest
  `permissions.fileSystem.readPaths` are now partially enforced on the current
  file-based skill execution path when a skill call includes `input.filePath`.
  Manifest `permissions.network`, `permissions.fileSystem.writePaths`, and full
  manifest boundary coverage still should not be described as fully
  runtime-enforced.
- Generated/imported skills now have a narrow governed intake path in
  `skills/index.ts`. They do not become executable on the normal skill path
  unless that explicit intake path stages them and then explicitly approves
  them. Governed approval now also requires a reviewable provenance snapshot
  before activation. Approved governed skills with builtin executor bindings
  now rehydrate from `OrchestratorState.governedSkillState` during skill
  bootstrap; metadata-only governed skills still require re-registration after
  restart before they can execute again.

## 6) Intentional But Partial Governance

- ToolGate is `partial runtime`: active preflight authorization and logging,
  not a universal execution boundary or skill executor.
- SkillAudit is `partial runtime`: a real governance surface with a coherent
  bootstrap contract, and the skill registry now initializes lazily on the
  first direct `executeSkill()` call. It still is not a universal enforcement
  layer across every execution path.
- Generated/imported skill intake is `partial runtime`: `registerGovernedSkill()`
  now defines the explicit intake path for non-built-in skills, and
  `approveGovernedSkill()` defines the minimum trust gate before activation.
  `OrchestratorState.governedSkillState` now provides partial restart-safe
  durability for approved governed skills with builtin executor bindings. This
  is still a narrow scaffold rather than end-to-end governed self-extension,
  because metadata-only governed skills still require re-registration after
  restart.
- Skill helpers and manifest permission structures are protected governance
  surfaces. They should remain in place even where current enforcement is
  incomplete.
- Self-developing or imported skill governance is an intended direction, not a
  completed end-to-end enforcement path yet.

## 4) State, Memory, and Output Surfaces

Verified:

- `orchestrator_state.json` remains the primary local state file.
- `orchestrator_state.json` now also carries governed skill durability through
  `governedSkillState`.
- `orchestrator_state.json` now also carries persisted task retry recovery
  records through `taskRetryRecoveries`, so retryable tasks can be requeued
  after restart through the existing task path.
- The protected `/api/dashboard/overview` route now also exposes a real
  governance summary sourced from approvals, retry recoveries, delivery
  backlog, and governed skill durability state.
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
