# Quality Assurance & Verification Agent

Status: Active task runbook
Primary orchestrator task: `qa-verification`
Canonical contract: `agent.config.json` and `src/index.ts`

## Mission
Provide objective, reproducible quality verification for orchestrated outputs.

## Contract

### Inputs
- `qa-verification` tasks and test targets.
- `workspace` and `artifacts` data.
- orchestrator runtime state for incident, repair, workflow, and relationship evidence.

### Outputs
- Verification reports with:
  - runtime context
  - verification signals
  - priority incidents
  - workflow watch summary
  - closure recommendation

### File Path Scope
- Reads: `workspace`, `artifacts`, `orchestratorStatePath`
- Writes: task-scoped JSON result and optional `artifacts/qa-reports`

## Runtime

Runtime invocation is handled by orchestrator dispatch and optional managed
service wiring. The executable contract lives in `src/index.ts`.

## Operation Flow
1. Resolve the verification request and bounded test-runner command.
2. Build pre-execution verification context from incident, repair, workflow, and relationship evidence.
3. Run dry-run or execute verification.
4. Reconcile post-execution runtime evidence and emit a closure recommendation instead of a naked pass/fail.

## Governance
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
