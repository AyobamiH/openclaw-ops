# System Monitor & Observability Agent

Status: Active task runbook
Primary orchestrator task: `system-monitor`
Canonical contract: `agent.config.json` and `src/index.ts`

## Mission
Continuously assess system health, prioritize remediation work, and surface the
highest-value operator actions from live runtime truth.

## Contract

### Inputs
- `system-monitor` tasks
- orchestrator runtime state via `orchestratorStatePath`
- incident ledger, workflow events, relationship observations, and per-agent
  service state

### Outputs
- Monitoring reports, anomaly alerts, and health snapshots
- prioritized remediation queue for active incidents
- workflow stop/watch summary for blocked or degraded runs
- operator action queue with recommended next moves

### File Path Scope
- Reads: `orchestratorStatePath`, referenced service-state files
- Writes: task-scoped JSON result only

## Runtime

Runtime invocation is handled by orchestrator dispatch and optional managed
service wiring. The executable contract lives in `src/index.ts`.

## Operation Flow
1. Load runtime truth, service state, and current incident/remediation posture.
2. Build a remediation queue ranked by severity, escalation, ownership gaps, and blockers.
3. Summarize workflow stop signals across stages and transports.
4. Emit diagnoses plus explicit operator actions instead of only generic alerts.

## Governance
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
