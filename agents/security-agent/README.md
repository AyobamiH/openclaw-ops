# Security Audit Agent

Status: Active task runbook
Primary orchestrator task: `security-audit`
Canonical contract: `agent.config.json` and `src/index.ts`

## Mission
Produce high-confidence security assessments with actionable remediation guidance.

## Contract

### Inputs
- `security-audit` tasks.
- Local policy/config/code artifacts relevant to audit scope.

### Outputs
- Structured audit findings with severity and remediation.

### File Path Scope
- No explicit path map in config; outputs remain task-scoped and auditable.

## Runtime

- Local entrypoint: `npm run dev`
- Validation: `npm run test:local`
- Focused checks: `npm run test:security`, `npm run test:secrets`

## Governance
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
