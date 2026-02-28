# Document & Data Extraction Agent

## Mission
Convert local document inputs into structured, normalized data artifacts.

## I/O Contract
### Inputs
- `data-extraction` tasks.
- Files from `workspace`.

### Outputs
- Structured records in `artifacts/extracted`.

### File Path I/O
- Reads: `workspace`
- Writes: `artifacts/extracted`

## How It Runs
```bash
cd agents/data-extraction-agent
npm install
npm start
```

## Governance Links
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
