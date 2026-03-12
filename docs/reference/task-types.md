---
title: "Task Types Reference"
summary: "Current allowlisted task types in the orchestrator runtime."
---

# Task Types Reference

The canonical task allowlist lives in:

```text
workspace/orchestrator/src/taskHandlers.ts
```

This document mirrors the current allowlist at a high level. If it diverges,
the code wins.

## Current Allowlisted Task Types

### Core Runtime

- `startup`
- `doc-change`
- `doc-sync`
- `drift-repair`
- `rss-sweep`
- `nightly-batch`
- `send-digest`
- `heartbeat`

### External / Community / Content

- `reddit-response`
- `content-generate`
- `market-research`
- `data-extraction`
- `normalize-data`
- `summarize-content`

### Quality / Security / System

- `security-audit`
- `system-monitor`
- `qa-verification`
- `skill-audit`
- `integration-workflow`

### Sensitive / Approval-Gated

- `build-refactor`
- `agent-deploy`

## Approval Requirements

By default, these task types require approval before execution:

- `build-refactor`
- `agent-deploy`

Every allowlisted task can also be dynamically approval-gated when
`payload.requiresApproval === true`.

The approval gate behavior is implemented in:

```text
workspace/orchestrator/src/approvalGate.ts
```

## Operational Classification (Validation Sweep Truth)

Labels used below:

- `internal-only`
- `public-triggerable`
- `approval-gated`
- `confirmed working`
- `partially operational`
- `externally dependent`
- `unconfirmed in latest sweep`

Status labels below are grounded in the latest completed validation sweep plus
the current runtime code path split in `taskHandlers.ts`,
`validation.ts`, and `approvalGate.ts`.

Do not treat `unconfirmed in latest sweep` as evidence of end-to-end health.
It means the task is present in runtime and may be routable, but it was not
confirmed as working through a real task execution path in the latest sweep.

Approval column:

- `dynamic-only`: not default-gated, but `payload.requiresApproval === true`
  can still force approval.
- `default + dynamic`: in the default approval-required set and also supports
  dynamic approval forcing.

| Task Type | Surface | Approval | Handler | Agent Dependency | ToolGate Preflight | Operational Truth / Dependency Notes |
|---|---|---|---|---|---|---|
| `startup` | `internal-only` | `dynamic-only` | `startupHandler` | none | no | Internal boot path; not publicly triggerable; do not present as user-runnable. |
| `doc-change` | `internal-only` | `dynamic-only` | `docChangeHandler` | none | no | Internal doc-watch buffer path; not publicly triggerable. When buffered drift reaches the runtime threshold (`25` pending paths), the orchestrator auto-enqueues `drift-repair`, records bounded repair state, and applies a same-doc-set cooldown keyed through persisted repair history to prevent repeated auto repair churn. |
| `doc-sync` | `public-triggerable` | `dynamic-only` | `docSyncHandler` | none | no | Public schema allows it, but latest sweep did not confirm end-to-end execution. |
| `drift-repair` | `public-triggerable`; `confirmed working (2026-03-07 local smoke)` | `dynamic-only` | `driftRepairHandler` | `doc-specialist` | no | Custom helper spawn path, not ToolGate-preflighted. `POST /api/tasks/trigger` produced `run_id=auto-8ef2eb1a3ff49ddd4237ee019d646b4810f9418c699b3a2a1de7682e388fd502`, verified a knowledge pack on disk, and surfaced repair evidence in `/api/tasks/runs`, `/api/dashboard/overview.selfHealing`, and `/api/health/extended.repairs`. |
| `reddit-response` | `public-triggerable`; `partially operational`; `externally dependent` | `dynamic-only` | `redditResponseHandler` | `reddit-helper` | no | Custom helper spawn path, not ToolGate-preflighted; `reddit-helper` now consumes the latest dual-source knowledge pack plus runtime doctrine/model defaults from `workspace/orchestrator_config.json`, applies service-state dedupe (`processedIds`), per-cycle throttles, daily LLM budgets, and deterministic local scoring, and only uses the model for an optional final polish pass when budget allows. Spawned helper runs now inherit orchestrator-shared runtime dependencies through `NODE_PATH`, and real helper exceptions fail the task instead of silently falling back to a green run. `reddit-response` now consumes only `selectedForDraft=true` queue items from backlog; `priority` queue items are auto-selected by `nightly-batch`, `manual-review` leads require explicit approval through `/api/approvals/:id/decision`, and the top `10` `draft` leads can now be promoted through the same approval/replay surface. |
| `security-audit` | `public-triggerable`; `confirmed working (2026-03-07 sweep)` | `dynamic-only` | `securityAuditHandler` | `security-agent` | yes | `POST /api/tasks/trigger` -> `/api/tasks/runs` -> `/api/memory/recall` produced a success path on `2026-03-07`; current worker logic is local/simulated rather than a live external scan. Logical `success !== true` now fails the run instead of reporting green. |
| `summarize-content` | `public-triggerable`; `confirmed working (2026-03-07 sweep)` | `dynamic-only` | `summarizeContentHandler` | `summarization-agent` | yes | Local-content path was confirmed through a real spawned-worker run on `2026-03-07`; manifest network remains disabled. Logical `success !== true` now fails the run instead of reporting green. |
| `system-monitor` | `public-triggerable`; `confirmed working (2026-03-07 sweep)` | `dynamic-only` | `systemMonitorHandler` | `system-monitor-agent` | yes | Real spawned-worker success observed on `2026-03-07`; current worker logic is still local/simulated. Logical `success !== true` now fails the run instead of reporting green. |
| `build-refactor` | `public-triggerable`; `approval-gated`; `confirmed working` | `default + dynamic` | `buildRefactorHandler` | `build-refactor-agent` | yes | Confirmed working after approval; local patch/test path proves gate + replay without proving all gated tasks. |
| `content-generate` | `public-triggerable`; `confirmed working (2026-03-07 sweep)` | `dynamic-only` | `contentGenerateHandler` | `content-agent` | yes | Real spawned-worker success observed on `2026-03-07`; current worker output is local/template-based rather than an externally published path. |
| `integration-workflow` | `public-triggerable`; `confirmed working (2026-03-07 sweep)` | `dynamic-only` | `integrationWorkflowHandler` | `integration-agent` | yes | Real spawned-worker success observed on `2026-03-07`; the current workflow logic is still local/simulated. |
| `normalize-data` | `public-triggerable`; `confirmed working (2026-03-07 sweep)` | `dynamic-only` | `normalizeDataHandler` | `normalization-agent` | yes | Local normalization path was confirmed through a real spawned-worker run on `2026-03-07`. |
| `market-research` | `public-triggerable`; `confirmed working`; `partially operational`; `externally dependent` | `dynamic-only` | `marketResearchHandler` | `market-research-agent` | yes | Query-only mode is confirmed working; URL mode remains dependency-sensitive because it depends on `sourceFetch` + allowed-domain network access. |
| `data-extraction` | `public-triggerable`; `confirmed working (2026-03-07 sweep)` | `dynamic-only` | `dataExtractionHandler` | `data-extraction-agent` | yes | Inline-source lane was confirmed through a real spawned-worker run on `2026-03-07`; file/documentParser lanes were not part of that sweep. |
| `qa-verification` | `public-triggerable`; `confirmed working (2026-03-07 live smoke)` | `dynamic-only` | `qaVerificationHandler` | `qa-verification-agent` | yes | `POST /api/tasks/trigger` proved both the explicit dry-run lane (`run_id=auto-ab9d0a9c26592ea10df5debebc06ada2ad4e8c69a5c2c87551bc487323e38c0b`) and a minimal allowed real run via `build-verify` (`run_id=auto-873d79d22f76f8513265122ea60b438a56b72dba1775b22eef894a21f59ba2c7`). `/api/skills/audit?limit=20` now shows `mode=execute` records for `testRunner`, and the dry-run path is explicitly labeled instead of reporting a silent `0/0` green. |
| `skill-audit` | `public-triggerable`; `confirmed working (2026-03-07 live smoke)` | `dynamic-only` | `skillAuditHandler` | `skill-audit-agent` | yes | `POST /api/tasks/trigger` produced `run_id=auto-422824bdb596425df615628fe035edd607304a5a7dd052b85706b3e2748b24d1` after the contract fix. ToolGate preflight remains visible in `/api/skills/audit`. |
| `rss-sweep` | `public-triggerable`; `externally dependent` | `dynamic-only` | `rssSweepHandler` | none | no | Depends on `rssConfigPath`, live feeds, and network availability; routing truth does not prove downstream feed success. |
| `nightly-batch` | `public-triggerable`; `historical success observed 2026-03-06` | `dynamic-only` | `nightlyBatchHandler` | none | no | Also runs from cron; `/api/dashboard/overview.recentTasks` showed success on `2026-03-06`, but the task was not re-run in the `2026-03-07` safe sweep because it writes digest artifacts and emits delivery surfaces. It now derives `selectedForDraft` from existing RSS routing tags: only `priority` queue items are auto-selected for `reddit-response`; `manual-review` items create mandatory pending approvals; and the top `10` `draft` items create optional promotion approvals while staying unselected until an operator approves replay. |
| `send-digest` | `public-triggerable`; `partially operational`; `externally dependent` | `dynamic-only` | `sendDigestHandler` | none | no | Historical success exists in protected recent-task data, but the `2026-03-07` safe sweep did not re-run it because the live config points at an outbound notification target. |
| `heartbeat` | `public-triggerable`; `confirmed working` | `dynamic-only` | `heartbeatHandler` | none | no | Confirmed healthy control-plane path. |
| `agent-deploy` | `public-triggerable`; `approval-gated`; `unconfirmed in latest sweep` | `default + dynamic` | `agentDeployHandler` | none | no | Approval path is active, but end-to-end deployment success is not confirmed in the latest sweep. |

## Public vs Internal Scope

- Internal runtime allowlist (`ALLOWED_TASK_TYPES`) is broader than public
  trigger schema (`TaskTriggerSchema`).
- `startup` and `doc-change` are internal-only even though they are in the
  internal allowlist.
- Any allowlisted task can become approval-gated dynamically when
  `payload.requiresApproval === true`; the default gate set is narrower.
- Approval-gated does not mean end-to-end validated:
  `build-refactor` is the confirmed gated path, while `agent-deploy` remains
  approval-gated but unconfirmed in the latest sweep.
- A task being `public-triggerable` only means the trigger route accepts it. It
  does not, by itself, prove downstream dependencies are healthy.

## Operator API Truth for Task Capabilities

- `GET /api/tasks/catalog` is the operator capability endpoint.
- It returns hybrid truth fields:
  - static operational classification labels (from validated runtime policy), and
  - telemetry overlays (recent execution success/failure/retrying counts).
- Telemetry overlays are observational and do **not** auto-mutate policy
  classifications.
- Mixed-mode task truth can be narrower in the operator UI than in this
  reference table. Example: `market-research` is surfaced as a partial/external
  profile in `/api/tasks/catalog`, while the validation sweep still confirms
  query-only mode as working.
- `GET /api/tasks/runs` and `GET /api/tasks/runs/:runId` provide first-class run
  detail visibility for operator diagnostics.

## Notes By Task Family

### Runtime Tasks

- `startup` records boot state and emits a startup milestone.
- `doc-change` and `doc-sync` manage the doc-change buffer.
- `drift-repair` can trigger doc-specialist work and emit milestone records.
- `rss-sweep`, `nightly-batch`, `send-digest`, and `heartbeat` support
  recurring operational flows.

### Worker / Agent Tasks

These route work to specialized agents or helper flows:

- `reddit-response`
- `security-audit`
- `summarize-content`
- `system-monitor`
- `content-generate`
- `integration-workflow`
- `normalize-data`
- `market-research`
- `data-extraction`
- `qa-verification`
- `skill-audit`

### Sensitive Tasks

- `build-refactor` is intentionally guarded because it can modify code and run
  tests.
- `agent-deploy` is intentionally guarded because it creates deployable agent
  surfaces.

## Where To Inspect Behavior

- `workspace/orchestrator/src/taskHandlers.ts`: handler implementations
- `workspace/orchestrator/src/middleware/validation.ts`: request schema allowlist
- `workspace/orchestrator/src/approvalGate.ts`: approval logic
- [./api.md](./api.md): API surfaces that trigger or inspect work
