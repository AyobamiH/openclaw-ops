# Doc Specialist ("Doc Doctor")

## Mission
Keep OpenClaw documentation synchronized with reality and generate fresh knowledge packs whenever drift is detected.

## Inputs
- `doc-diff` payloads from the Orchestrator (`drift-repair` tasks)
- Local mirrors referenced by `docsPath` and `cookbookPath` in `agent.config.json`
- Optional escalation context from `orchestratorStatePath`

### Input Path Declarations (from `agent.config.json`)
- `docsPath`
- `cookbookPath`
- `orchestratorStatePath`
- `knowledgePackDir`
- `serviceStatePath`

These paths are part of the protected repository hygiene surface and must be evaluated under `docs/GOVERNANCE_REPO_HYGIENE.md` before any cleanup recommendation.

## Outputs
- Structured completion logs pushed back to the Orchestrator (`doc-sync` and `drift-repair` records)
- Updated knowledge packs written to `knowledgePackDir`
- Telemetry events (success/failure, per-file stats)

## Operation Flow
1. Receive a `drift-repair` task containing doc paths and target agents to refresh.
2. Load the affected docs and create a knowledge pack artifact.
3. Emit telemetry via `shared/telemetry.ts` for each stage (load, pack generation, upload).
4. Return a JSON summary so the Orchestrator can update `driftRepairs` history.

## Runtime Invocation
- This agent does not currently ship a local `package.json` script surface.
- Runtime invocation is managed by orchestrator task dispatch and systemd service wiring.

## Escalation Rules
- If a doc fails validation, emit `drift-alert` with the file path and reason.
- If knowledge pack upload fails twice, mark the task `error` and raise to a human operator.

See `src/index.ts` for the executable entry point and `agent.config.json` for environment expectations.

## Governance Primitives
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- Canonical policy: `../../docs/GOVERNANCE_REPO_HYGIENE.md`
