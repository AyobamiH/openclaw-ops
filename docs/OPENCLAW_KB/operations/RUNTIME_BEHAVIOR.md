# Runtime Behavior (Observed)

Last updated: 2026-03-07

## Startup Sequence
1. Security posture verification (critical env vars + API key rotation policy)
2. Config load + directory preparation
3. Agent registry discovery
4. Alerting + metrics init
5. Optional persistence/memory/knowledge startup (partially skippable with fast-start; doc indexers/watch hooks stay enabled, but the initial crawl now warms after HTTP startup)
6. HTTP server startup and route registration
7. Persisted `taskRetryRecoveries` are rescheduled after restart
8. Doc watch hooks are attached whenever configured doc/cookbook roots index successfully, including fast-start
9. `nightly-batch`, `send-digest`, and `heartbeat` cron jobs are scheduled even in fast-start
10. Milestone and demand-summary retry pollers are scheduled only outside fast-start
11. Stranded persisted `retrying` task executions without a matching recovery record are normalized to failed-on-restart
12. Startup task enqueue

## Scheduling
- Nightly batch (always scheduled)
- Morning digest (always scheduled)
- Periodic heartbeat (always scheduled)
- Milestone delivery retry poller (disabled in fast-start)
- Demand summary delivery retry poller (disabled in fast-start)
- Alert cleanup intervals
- Heartbeat hang detection interval

## Concurrency
- Queue concurrency is fixed to 2 via `p-queue`.

## Operational Caveats
- Fast-start mode bypasses heavy subsystems and is intended for controlled testing scenarios.
- In fast-start mode, core routing can still remain usable while persistence
  and other dependency-backed subsystems are intentionally degraded or skipped.
- Fast-start now keeps doc/cookbook freshness active by constructing indexers
  and watch hooks immediately, then warming the initial crawl after HTTP
  startup so the control plane does not stall before `listen(...)`.
- In that mode, task acceptance can remain live even though durability and
  richer operator evidence are degraded.
- Fast-start does not mean "no cron activity": the runtime still schedules
  `nightly-batch`, `send-digest`, and `heartbeat`; only the delivery retry
  pollers stay disabled.
- Fast-start should be treated as a validation/developer mode, not as the
  baseline for normal healthy runtime behavior.
- The canonical non-fast-start path is now proven on `3312`: Mongo-backed
  persistence, MemoryScheduler, KnowledgeIntegration, and hourly snapshot
  writes all start cleanly, with snapshots now writing under
  `resolve(config.logsDir, "snapshots")`.
- Runtime behavior differs depending on direct service execution vs orchestrator dispatch.
- Spawned-agent outcome semantics follow a hard-cutover contract (no backward compatibility): see `docs/OPENCLAW_KB/operations/AGENT_EXECUTION_CONTRACT.md`.
- Task retries now have a persisted restart recovery path through
  `taskRetryRecoveries`, but the recovery remains partial: it is a real
  requeue path, not an exactly-once replay guarantee.
- The runtime now also tracks bounded repair evidence through `repairRecords`.
  This makes auto-repair attempts visible as explicit runtime state instead of
  leaving them implicit in queue logs.
- The protected `/api/dashboard/overview` surface now exposes a partial
  operator-visible governance summary over approvals, retry recovery backlog,
  repair state, delivery backlog, and governed skill durability state.
- Future imported or generated skills should only be considered trusted after
  they pass through the intended governed path: registration, permission
  declaration, audit/review, and an explicit runtime execution path.
- Approved governed skills with builtin executor bindings are now rehydrated
  from `OrchestratorState.governedSkillState` during skill bootstrap, so they
  survive restart on the normal skill path. Pending-review governed skills and
  metadata-only governed registrations still remain non-executable after
  restart until they are explicitly re-approved or re-registered.

## Dependency vs Control-Plane Truth

- External dependency failure is distinct from control-plane failure.
- A task can be accepted and queued successfully while still degrading later in
  downstream IO, external services, or config-dependent phases.
- Repair evidence is a third separate truth. A repair can be detected and
  verified even while broader dependency health remains degraded.
- `/health` is a shallow liveness surface and can remain `healthy` while
  `/api/health/extended` reports degraded dependencies.
- Operator health storytelling now includes a protected extended health surface
  (`/api/health/extended`) that separates control-plane routing truth from
  dependency degradation.
- Persistence operator visibility now includes `/api/persistence/summary` in
  addition to historical/export paths.
- Task run diagnostics now have first-class endpoints (`/api/tasks/runs`,
  `/api/tasks/runs/:runId`) rather than only queue acceptance + recent slices.
- Protected route access now propagates role context (`viewer`, `operator`,
  `admin`) with per-route authorization and audit logging.
- Operational reporting should explicitly distinguish:
  - control-plane intake/routing health,
  - approval-gate progression,
  - downstream dependency health.
- Current observed examples:
  - `heartbeat` is a clean control-plane success path.
  - `build-refactor` is working after approval, which proves the gate and
    replay path without implying every gated task is equally healthy.
  - `market-research` query-only mode works, while URL mode remains more
    dependency-sensitive.
  - The `2026-03-07` local spawned-worker sweep also confirmed
    `summarize-content`, `normalize-data`, `data-extraction` (inline-source
    lane), `security-audit`, `system-monitor`, `content-generate`, and
    `integration-workflow` through real `/api/tasks/trigger` executions.
  - The `2026-03-07` repair follow-up confirmed a bounded live repair loop:
    `drift-repair` produced and verified a knowledge pack
    (`run_id=auto-8ef2eb1a3ff49ddd4237ee019d646b4810f9418c699b3a2a1de7682e388fd502`),
    `/api/tasks/runs` attached `repair` metadata, and both
    `/api/dashboard/overview.selfHealing` and `/api/health/extended.repairs`
    reported the verified repair.
  - That bounded repair loop now also uses a same-doc-set cooldown on the
    internal `doc-change` auto-enqueue path so repeated drift on the same
    buffered doc set does not immediately cause another auto repair.
  - Placeholder systemd units for unfinished agent daemons are now explicitly
    gated on `src/service.ts`; they remain scaffolding and are not evidence of
    a runnable service mode.
  - Those confirmations do not erase implementation limits: several of the
    current workers are still local/template/simulated lanes rather than live
    external integrations.
  - `qa-verification` and `skill-audit` are no longer blocked by their old
    contract mismatches; both now have live `2026-03-07` evidence-backed runs.
  - `security-audit`, `summarize-content`, and `system-monitor` now treat
    logical `success !== true` as failure instead of allowing green exit-code
    success to mask a bad result.
  - Agent service truth is now split between `serviceAvailable` and
    `serviceInstalled` / `serviceRunning`; the orchestrator now distinguishes
    service code in repo from installed host units and active host-running
    state.
  - `rss-sweep` remains config/network dependent even when routing is healthy.
  - `reddit-response` still depends on provider availability, but its local
    context path is stronger now: targeted `drift-repair` packs stay dual-source
    and `reddit-helper` loads runtime doctrine/model defaults from the active
    orchestrator config instead of relying on agent-manifest-only wiring.
