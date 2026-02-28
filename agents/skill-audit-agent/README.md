# Skill Audit & Verification Agent

Status: Active task runbook
Primary orchestrator task: `skill-audit`
Canonical contract: `agent.config.json` and `src/index.ts`

## Mission
Audit skill behavior and reliability with test-backed compliance evidence.

## Contract

### Inputs
- `skill-audit` tasks and target skill context.

### Outputs
- Audit findings, test results, and remediation recommendations.

### File Path Scope
- No explicit path map in config; outputs are task-scoped.

## Runtime

- Local entrypoint: `npm run dev`
- Validation: `npm run test:local`
- Audit surface: `npm run audit:all`, `npm run check:compliance`

## Governance
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
