# Build & Refactor Agent

## Mission
Perform safe, scoped code refactoring and build-oriented cleanups with validation.

## I/O Contract
### Inputs
- `build-refactor` tasks.
- Target code context and constraints from `agent.config.json`.

### Outputs
- Refactor summary, patch result, and test verification status.

### File Path I/O
- Local workspace edits via `workspacePatch`.
- No network usage.

## How It Runs
```bash
cd agents/build-refactor-agent
npm install
npm run dev
```

## Governance Links
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
