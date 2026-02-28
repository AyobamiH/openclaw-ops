# Data Normalization Agent

Status: Active task runbook
Primary orchestrator task: `normalize-data`
Canonical contract: `agent.config.json` and `src/index.ts`

## Mission
Standardize mixed input data into consistent formats for downstream automation.

## Contract

### Inputs
- `normalize-data` tasks with raw or semi-structured data.

### Outputs
- Normalized records and validation/error summaries.

### File Path Scope
- No explicit path map in config; outputs must remain task-scoped.

## Runtime

- Local entrypoint: `npm run dev`
- Validation: `npm run test:local`
- Targeted checks: `npm run validate:schema`, `npm run test:performance`

## Governance
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
