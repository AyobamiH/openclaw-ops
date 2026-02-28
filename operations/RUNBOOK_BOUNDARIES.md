# Operations Runbook: Control Boundaries

## Approved Runtime Modes

- Preferred: `orchestrator/docker-compose.yml` for integrated stack.
- Alternate: root `docker-compose.yml` only if deliberately documented for simplified deploys.
- systemd units are emergency/legacy unless explicitly approved.

## Boundary Rules

1. Do not invoke agent binaries directly for production workflow tasks.
2. Use `POST /api/tasks/trigger` for controlled task execution.
3. Keep standalone `doc-specialist` and `reddit-helper` services disabled in prod if orchestrator dispatch is required.
4. Persist logs and state volumes before upgrades.

## Drift Detection Checks

- Check enabled services: `systemctl --user list-unit-files | grep -E 'orchestrator|doc-specialist|reddit-helper'`
- Check compose active profile and containers.
- Compare running mode against governance policy.

## Incident Defaults

- Unknown task trigger attempts: treat as security signal.
- Missing env vars at startup: expected hard-stop; do not bypass.
- Persistence init failure: run in degraded mode only with explicit acknowledgment.
