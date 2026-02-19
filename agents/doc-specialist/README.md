# Doc Specialist ("Doc Doctor")

## Mission
Keep OpenClaw documentation synchronized with reality and generate fresh knowledge packs whenever drift is detected.

## Inputs
- `doc-diff` payloads from the Orchestrator (`drift-repair` tasks)
- Local docs mirror at `openclaw-docs/`
- Optional escalation context from `orchestrator_state.json`

## Outputs
- Structured completion logs pushed back to the Orchestrator (`doc-sync` and `drift-repair` records)
- Updated knowledge packs stored under `logs/knowledge-packs/`
- Telemetry events (success/failure, per-file stats)

## Operation Flow
1. Receive a `drift-repair` task containing doc paths and target agents to refresh.
2. Load the affected docs, rebuild embeddings, and create a knowledge pack artifact.
3. Emit telemetry via `shared/telemetry.ts` for each stage (load, pack generation, upload).
4. Return a JSON summary so the Orchestrator can update `driftRepairs` history.

## Running Locally
```bash
cd agents/doc-specialist
npm install
npm run dev -- --task payloads/drift-repair.sample.json
```

The template ships without dependencies; add any RAG/tooling packages you need and update `package.json` accordingly.

## Escalation Rules
- If a doc fails validation, emit `drift-alert` with the file path and reason.
- If knowledge pack upload fails twice, mark the task `error` and raise to a human operator.

See `src/index.ts` for the executable entry point and `agent.config.json` for environment expectations.
