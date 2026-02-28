# Integration & Workflow Agent

## Mission
Orchestrate multi-step data workflows and maintain safe, consistent handoffs.

## I/O Contract
### Inputs
- `integration-workflow` tasks and workflow definitions.

### Outputs
- Workflow completion status, normalized intermediates, and failure context.

### File Path I/O
- No explicit read/write path map in config; outputs must remain task-scoped.

## How It Runs
```bash
cd agents/integration-agent
npm install
npm run test:local
```

## Governance Links
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
