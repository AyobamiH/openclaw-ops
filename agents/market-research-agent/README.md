# Market & Web Research Agent

## Mission
Collect and summarize market signals from approved online sources.

## I/O Contract
### Inputs
- `market-research` tasks.
- Allowlisted target URLs and prompts.

### Outputs
- Research summaries and extracted evidence in `artifacts/research`.

### File Path I/O
- Reads: `workspace/research`
- Writes: `artifacts/research`

## How It Runs
```bash
cd agents/market-research-agent
npm install
npm start
```

## Governance Links
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
