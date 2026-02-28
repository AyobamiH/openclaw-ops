# Reddit Helper

## Mission
Respond to queued questions in OpenClaw community channels (Reddit, forums) using the freshest knowledge packs produced by the Doc Specialist.

## Inputs
- `reddit-response` tasks containing either an inline question payload or an instruction to sweep the queue
- Latest knowledge pack metadata available through config keys (`knowledgePackDir`, `orchestratorStatePath`)
- Optional handcrafted draft responses

## Outputs
- Draft/reply metadata written back to the Orchestrator (`redditResponses` log)
- Community telemetry (question link, confidence score, escalation flags)

## Run Loop
1. Fetch the next queued question (`redditQueue.shift()` provided by the Orchestrator) or hydrate from payload.
2. Build an answer using docs/knowledge packs, citing relevant sections.
3. Log draft output and optional Devvit submission payload, then report status through telemetry + orchestrator task history.

## Runtime Invocation
- This agent does not currently ship a local `package.json` script surface.
- Runtime invocation is managed by orchestrator task dispatch and systemd service wiring.

## Escalation Rules
- Set `status = error` when confidence < 0.5 and emit `reddit-escalate` with the question link.
- Surface helpful context (docs section, pack ID) in the task result to keep Orchestrator state rich.

The agent writes:
- Draft history → `draftLogPath`
- Devvit submission queue → `devvitQueuePath`
- Result payload (when orchestrator invokes) → `REDDIT_HELPER_RESULT_FILE`

See `agent.config.json` and `src/index.ts` for reference wiring.

## Governance Primitives
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- Canonical policy: `../../docs/GOVERNANCE_REPO_HYGIENE.md`
