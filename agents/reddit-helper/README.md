# Reddit Helper

Status: Active task runbook
Primary orchestrator task: `reddit-response`
Canonical contract: `agent.config.json` and `src/index.ts`

## Mission
Respond to queued questions in OpenClaw community channels (Reddit, forums) using the freshest knowledge packs produced by the Doc Specialist.

## Contract

### Inputs
- `reddit-response` tasks containing either an inline question payload or an instruction to sweep the queue
- Latest knowledge pack metadata available through config keys (`knowledgePackDir`, `orchestratorStatePath`)
- Optional handcrafted draft responses

### Outputs
- Draft/reply metadata written back to the Orchestrator (`redditResponses` log)
- Community telemetry (question link, confidence score, escalation flags)

### File Path Scope
- Draft history -> `draftLogPath`
- Devvit submission queue -> `devvitQueuePath`
- Result payload -> `REDDIT_HELPER_RESULT_FILE`

## Runtime

This agent does not currently expose a local `package.json` script surface.
Runtime invocation is handled by orchestrator dispatch and optional managed
service wiring.

## Run Loop
1. Fetch the next queued question (`redditQueue.shift()` provided by the Orchestrator) or hydrate from payload.
2. Build an answer using docs/knowledge packs, citing relevant sections.
3. Log draft output and optional Devvit submission payload, then report status through telemetry + orchestrator task history.

## Escalation Rules
- Set `status = error` when confidence < 0.5 and emit `reddit-escalate` with the question link.
- Surface helpful context (docs section, pack ID) in the task result to keep Orchestrator state rich.

See `agent.config.json` and `src/index.ts` for reference wiring.

## Governance
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- Canonical policy: `../../docs/GOVERNANCE_REPO_HYGIENE.md`
