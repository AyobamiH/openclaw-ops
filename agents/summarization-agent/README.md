# Summarization Agent

## Mission
Produce concise, accurate summaries from long-form local content.

## I/O Contract
### Inputs
- `summarize-content` tasks and source documents/text.

### Outputs
- Summaries with key facts and compression metadata.

### File Path I/O
- No explicit path map in config; outputs must remain task-scoped.

## How It Runs
```bash
cd agents/summarization-agent
npm install
npm run test:local
```

## Governance Links
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
