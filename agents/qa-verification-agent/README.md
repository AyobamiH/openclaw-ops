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

### Outputs
- Verification reports in `artifacts/qa-reports`.

### File Path Scope
- Reads: `workspace`, `artifacts`
- Writes: `artifacts/qa-reports`

## Runtime

- Local entrypoint: `npm start`
- Alternate development loop: `npm run dev`
- Current test surface: `npm test` (placeholder until richer tests are added)

## Governance
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
