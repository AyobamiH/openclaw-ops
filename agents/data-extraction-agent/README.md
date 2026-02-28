# Document & Data Extraction Agent

Status: Active task runbook
Primary orchestrator task: `data-extraction`
Canonical contract: `agent.config.json` and `src/index.ts`

## Mission
Convert local document inputs into structured, normalized data artifacts.

## Contract

### Inputs
- `data-extraction` tasks.
- Files from `workspace`.

### Outputs
- Structured records in `artifacts/extracted`.

### File Path Scope
- Reads: `workspace`
- Writes: `artifacts/extracted`

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
