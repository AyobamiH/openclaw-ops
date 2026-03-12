# Integration & Workflow Agent

Status: Active task runbook
Primary orchestrator task: `integration-workflow`
Canonical contract: `agent.config.json` and `src/index.ts`

## Mission
Orchestrate multi-step workflows, preserve handoff truth, and produce recovery
plans when execution stalls or degrades.

## Contract

### Inputs
- `integration-workflow` tasks and workflow definitions
- orchestrator runtime state for incidents, workflow events, and relationship observations

### Outputs
- Workflow completion status, normalized intermediates, and failure context
- recovery plan with:
  - priority incidents
  - workflow watch summary
  - verifier handoff recommendation
  - relationship windows for participating agents

### File Path Scope
- Reads: orchestrator runtime state via `orchestratorStatePath`
- Writes: task-scoped JSON result only

## Runtime

Runtime invocation is handled by orchestrator dispatch and optional managed
service wiring. The executable contract lives in `src/index.ts`.

## Operation Flow
1. Resolve workflow intent, dependencies, and selected agents.
2. Execute each step with explicit stop-cause capture.
3. Reconcile current incident pressure and workflow stop signals.
4. Produce a recovery plan that can be handed to operators or `qa-verification-agent`.

## Governance
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
