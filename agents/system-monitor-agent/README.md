# System Monitor & Observability Agent

Status: Active task runbook
Primary orchestrator task: `system-monitor`
Canonical contract: `agent.config.json` and `src/index.ts`

## Mission
Continuously assess system health and provide high-signal operational alerts.

## Contract

### Inputs
- `system-monitor` tasks and health/metric inputs.

### Outputs
- Monitoring reports, anomaly alerts, and health snapshots.

### File Path Scope
- No explicit path map in config; outputs remain task-scoped.

## Runtime

- Local entrypoint: `npm run dev`
- Validation: `npm run test:local`
- Focused checks: `npm run test:metrics`, `npm run test:alerts`

## Governance
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
