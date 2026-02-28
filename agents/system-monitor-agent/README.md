# System Monitor & Observability Agent

## Mission
Continuously assess system health and provide high-signal operational alerts.

## I/O Contract
### Inputs
- `system-monitor` tasks and health/metric inputs.

### Outputs
- Monitoring reports, anomaly alerts, and health snapshots.

### File Path I/O
- No explicit path map in config; outputs remain task-scoped.

## How It Runs
```bash
cd agents/system-monitor-agent
npm install
npm run test:local
```

## Governance Links
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
