# Doc Update Workflow (Turn-by-Turn)

Use this checklist **for every implementation turn** touching orchestrator runtime/config.

Rule: every material code/config change must update the appropriate existing
`.md` file in the same change set and reference the affected runtime paths where
that improves traceability.

## 1) Implement code change

Update implementation files first.

## 2) Update status ledger (required)

Always update:

- `docs/operations/orchestrator-status.md`

Capture:

- what changed
- why it changed
- current risk/open issues
- next action

## 3) Update domain docs based on change area

- If `orchestrator/src/**` changed → update `orchestrator/docs/API_REFERENCE.md`
- If `orchestrator/Dockerfile`, `orchestrator/docker-compose.yml`, `orchestrator/monitoring/**` changed → update one of:
  - `orchestrator/docs/DEPLOYMENT_GUIDE.md`
  - `orchestrator/docs/DOCKER_DEPLOYMENT.md`
- If `orchestrator/test/**` changed → update `orchestrator/docs/LOAD_TEST_REPORT.md`

## 4) Run sync gate before handoff

From `orchestrator/`:

- `npm run docs:check-sync`

For staged-only checks before commit:

- `npm run docs:check-sync:staged`

## 5) If check fails

The checker prints exactly which required docs are missing.
Update those files and rerun.
