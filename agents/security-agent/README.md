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
- Structured audit findings with severity and remediation
- runtime remediation priorities for security-adjacent incidents

### File Path Scope
- Reads: task-scoped repo/config/runtime targets plus orchestrator runtime state
- Writes: task-scoped JSON result only

## Runtime

Runtime invocation is handled by orchestrator dispatch and optional managed
service wiring. The executable contract lives in `src/index.ts`.

## Operation Flow
1. Inspect code, config, and runtime posture relevant to the requested security scope.
2. Rank findings by severity and operational impact.
3. Cross-check the live incident ledger so security-adjacent runtime gaps are not lost behind static findings.
4. Return both findings and remediation priorities for operators or downstream agents.

## Governance
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
