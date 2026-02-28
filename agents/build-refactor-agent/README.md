# Build & Refactor Agent

Status: Active task runbook
Primary orchestrator task: `build-refactor`
Canonical contract: `agent.config.json` and `src/index.ts`

## Mission
Perform safe, scoped code refactoring and build-oriented cleanups with validation.

## Contract

### Inputs
- `build-refactor` tasks.
- Target code context and constraints from `agent.config.json`.

### Outputs
- Refactor summary, patch result, and test verification status.

### File Path Scope
- Local workspace edits via `workspacePatch`.
- No network usage.

## Runtime

- Local entrypoint: `npm run dev`
- Validation: `npm run test:local`
- Deeper verification: `npm run test:unit`, `npm run test:integration`

## Governance
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
