# RADAR

## Purpose

RADAR is the governance heartbeat for OpenClaw runtime discipline:
- **R**isks (what can break governance or reliability)
- **A**ssumptions (what must remain true in runtime)
- **D**ecisions (why the architecture is shaped this way)
- **A**ctions (hardening work underway)
- **R**esults (evidence from tests and operations)

Date: 2026-02-24
Owner: Runtime Governance

## Risks

1. CI can pass while runtime regressions slip if test gates are shallow.
2. Agent/task drift can happen if dispatch authority is bypassed.
3. Permission boundaries can drift if ToolGate checks are not wired to live runtime paths.
4. Operational analytics can be misleading where synthetic metrics remain in scheduler paths.

## Assumptions

1. Orchestrator remains the only authoritative task dispatch surface.
2. Agent configs remain the source of truth for task ownership and skill allowlists.
3. Security posture checks (required env + key-rotation policy) run before bootstrap.
4. Task history semantics remain binary and explicit: `ok` on success, `error` on failure.

## Decisions

1. Enforce fail-closed startup for missing critical credentials.
2. Enforce strict task-type allowlists at queue and handler resolution boundaries.
3. Require canonical webhook signatures with timing-safe verification.
4. Use hard-cutover error semantics instead of compatibility shims.
5. Run real test suites in CI (unit-fixture suite + runtime integration suite).

## Actions

1. Wire ToolGate preflight checks into spawned-agent task handlers.
2. Keep CI test workflow executable and non-placeholder.
3. Track and retire synthetic metrics paths in memory scheduler.
4. Continue reducing direct service-bypass surfaces where possible.

## Results (Current Evidence)

1. Runtime integration suite validates auth chain and result semantics.
2. Task history records explicit `ok/error` outcomes with real failure captures.
3. Webhook verification uses canonical payload HMAC and timing-safe compare.
4. Queue ingress rejects unknown task types by allowlist.

## Review Cadence

- Weekly governance review for Risks/Actions.
- Per-merge updates required when decisions or assumptions change.
- Immediate update required after any production incident touching governance boundaries.
