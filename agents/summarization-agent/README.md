# Summarization Agent

Status: Active task runbook
Primary orchestrator task: `summarize-content`
Canonical contract: `agent.config.json` and `src/index.ts`

## Mission
Produce concise, accurate summaries from long-form local content.

## Contract

### Inputs
- `summarize-content` tasks and source documents/text.

### Outputs
- Summaries with key facts and compression metadata.

### File Path Scope
- No explicit path map in config; outputs must remain task-scoped.

## Runtime

- Local entrypoint: `npm run dev`
- Validation: `npm run test:local`
- Deeper verification: `npm run test:unit`, `npm run test:integration`

## Governance
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `../../docs/GOVERNANCE_REPO_HYGIENE.md`
