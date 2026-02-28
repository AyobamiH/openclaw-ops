# Content Generation Agent

## Mission
Generate concise, accurate documentation and content from local repository evidence.

## I/O Contract
### Inputs
- `content-generate` tasks.
- Source content from local docs/code.

### Outputs
- Documentation drafts, API docs, or content briefs per task.

### File Path I/O
- No explicit read/write path list in config; task outputs must remain scoped and reviewable.

## How It Runs
```bash
cd agents/content-agent
npm install
npm run test:local
```

## Governance Links
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
