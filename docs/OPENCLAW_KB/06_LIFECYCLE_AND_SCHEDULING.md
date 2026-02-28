# Lifecycle and Scheduling Audit

Last updated: 2026-02-24

## Verified Lifecycle Stages

1. Security posture verification (env presence gate)
2. Config + directories initialization
3. Agent registry initialization attempt (non-fatal on failure)
4. Metrics and persistence startup (non-fatal on failure)
5. Document indexing + file watchers
6. Queue processor registration
7. Cron scheduling + heartbeat watchers
8. HTTP API startup
9. Graceful shutdown hooks (`SIGTERM`, `SIGINT`)

## Verified Scheduling Model

- Nightly batch: default `0 23 * * *`
- Digest notification: default `0 6 * * *`
- Heartbeat task enqueue every 5 minutes
- Auxiliary monitoring loops via `setInterval`

## Failure Semantics

**Verified hard-fail**
- Missing required security env vars abort startup.

**Verified soft-fail (continues running)**
- Agent registry initialization failure.
- Metrics server startup failure.
- Persistence layer startup failure.

## Governance Risks

- Mixed hard-fail/soft-fail policy lacks explicit SLO-driven rationale.
- Queue concurrency fixed at 2 without dynamic backpressure controls.
- No built-in dead-letter queue for failed task payloads.

## Recommended Policy

- Define mandatory subsystems per environment (`prod`, `dev`) with explicit fail-open/fail-closed matrix.
- Add task failure quarantine (dead-letter file/collection) for repeatable forensic replay.
