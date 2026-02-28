# Security Audit Agent

## Mission
Produce high-confidence security assessments with actionable remediation guidance.

## I/O Contract
### Inputs
- `security-audit` tasks.
- Local policy/config/code artifacts relevant to audit scope.

### Outputs
- Structured audit findings with severity and remediation.

### File Path I/O
- No explicit path map in config; outputs remain task-scoped and auditable.

## How It Runs
```bash
cd agents/security-agent
npm install
npm run test:local
```

## Governance Links
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
