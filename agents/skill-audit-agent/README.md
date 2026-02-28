# Skill Audit & Verification Agent

## Mission
Audit skill behavior and reliability with test-backed compliance evidence.

## I/O Contract
### Inputs
- `skill-audit` tasks and target skill context.

### Outputs
- Audit findings, test results, and remediation recommendations.

### File Path I/O
- No explicit path map in config; outputs are task-scoped.

## How It Runs
```bash
cd agents/skill-audit-agent
npm install
npm run audit:all
```

## Governance Links
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
