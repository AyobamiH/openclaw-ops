# OpenClaw Runtime Architecture (Current Summary)

Last reviewed: 2026-02-28

This is the consolidated generated summary for the KB. It replaces the older,
more repetitive derivative files that separately restated control-plane,
gateway, mission-lifecycle, and skill-layer summaries.

## Executive Overview

OpenClaw currently has a real orchestrator-first control plane:

- task intake is allowlisted
- queue entry is validated again at runtime
- invalid task types hard-fail
- many specialized jobs run through spawned-agent handlers
- milestone emission is wired into meaningful runtime events

The orchestrator is the intended center of control, but the repo still contains
alternate service surfaces (`systemd/*.service`) that can bypass the queue path
if operators choose to run them directly.

## Runtime Topology

- Control service: `orchestrator/src/index.ts`
- Queue and routing: `TaskQueue.enqueue()` plus `resolveTaskHandler()`
- Task execution patterns:
  - inline handlers
  - spawned-agent jobs via `runSpawnedAgentJob()`
  - specialized wrappers for `doc-specialist` and `reddit-helper`
- Skill layer:
  - definitions and executors in `skills/*.ts`
  - audit on registration via `orchestrator/src/skillAudit.ts`
  - authorization preflight via `orchestrator/src/toolGate.ts`
- State and artifacts:
  - `orchestrator_state.json`
  - per-agent `serviceStatePath`
  - logs/artifacts under configured workspace paths
  - optional persistence integrations

## Ingress and Policy Boundaries

- HTTP ingress still uses authentication, signature checks, validation, and rate
  limiting.
- API task creation is constrained by `TaskTriggerSchema`.
- Internal queue insertion is constrained by `validateTaskType()`.
- Spawned-agent task handlers perform ToolGate preflight before execution.

This is stronger than the earlier state of the project, but still not a full
host-level enforcement boundary.

## Mission Lifecycle (Current)

1. A task enters through API, scheduler, watcher, or internal orchestration.
2. The task is validated and allowlisted.
3. `TaskQueue` assigns runtime metadata and queues the work.
4. The handler resolves and runs.
5. The orchestrator records results, updates bounded state, and may emit
   milestones.
6. Logs, artifacts, and optional persistence layers retain the execution trace.

## Open Gaps That Still Matter

1. Standalone services can still run outside orchestrator-first dispatch.
2. Child-process environment inheritance is broader than ideal.
3. ToolGate is an authorization layer, not a full system sandbox.
4. Multiple state and artifact surfaces still require reconciliation discipline.

## Reading Order

If you need detail after this summary:

1. `00_SYSTEM_TRUTH.md`
2. `01_CONTROL_PLANE.md`
3. `02_GATEWAY_AND_POLICY.md`
4. `04_SKILLS_AND_SUPPLY_CHAIN.md`
5. `05_MEMORY_CONTEXT_PERSISTENCE.md`
6. `operations/AGENT_EXECUTION_CONTRACT.md`
