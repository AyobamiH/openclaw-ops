# Data Normalization Agent

## Mission
Standardize mixed input data into consistent formats for downstream automation.

## I/O Contract
### Inputs
- `normalize-data` tasks with raw or semi-structured data.

### Outputs
- Normalized records and validation/error summaries.

### File Path I/O
- No explicit path map in config; outputs must remain task-scoped.

## How It Runs
```bash
cd agents/normalization-agent
npm install
npm run test:local
```

## Governance Links
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
