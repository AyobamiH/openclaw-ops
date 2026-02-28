# Integration & Workflow Agent

Status: Active task runbook
Primary orchestrator task: `integration-workflow`
Canonical contract: `agent.config.json` and `src/index.ts`

## Mission
Orchestrate multi-step data workflows and maintain safe, consistent handoffs.

## Contract

### Inputs
- `integration-workflow` tasks and workflow definitions.

### Outputs
- Workflow completion status, normalized intermediates, and failure context.

### File Path Scope
- No explicit read/write path map in config; outputs must remain task-scoped.

## Runtime

- Local entrypoint: `npm run dev`
- Validation: `npm run test:local`
- Targeted checks: `npm run test:workflows`, `npm run test:error-handling`

## Governance
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
