# Quality Assurance & Verification Agent

## Mission
Provide objective, reproducible quality verification for orchestrated outputs.

## I/O Contract
### Inputs
- `qa-verification` tasks and test targets.
- `workspace` and `artifacts` data.

### Outputs
- Verification reports in `artifacts/qa-reports`.

### File Path I/O
- Reads: `workspace`, `artifacts`
- Writes: `artifacts/qa-reports`

## How It Runs
```bash
cd agents/qa-verification-agent
npm install
npm start
```

## Governance Links
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
