# Reddit Helper

## Mission
Respond to queued questions in OpenClaw community channels (Reddit, forums) using the freshest knowledge packs produced by the Doc Specialist.

## Inputs
- `reddit-response` tasks containing either an inline question payload or an instruction to sweep the queue
- Latest knowledge pack metadata (available via `orchestrator_state.json`)
- Optional handcrafted draft responses

## Outputs
- Posted reply metadata written back to the Orchestrator (`redditResponses` log)
- Community telemetry (question link, confidence score, escalation flags)

## Run Loop
1. Fetch the next queued question (`redditQueue.shift()` provided by the Orchestrator) or hydrate from payload.
2. Build an answer using docs/knowledge packs, citing relevant sections.
3. Post via Reddit API (or log a draft) and report the status through telemetry + orchestrator task history.

## Local Usage
```bash
cd agents/reddit-helper
npm install
npm run dev -- payloads/sample-question.json
```

## Escalation Rules
- Set `status = error` when confidence < 0.5 and emit `reddit-escalate` with the question link.
- Surface helpful context (docs section, pack ID) in the task result to keep Orchestrator state rich.

See `agent.config.json` and `src/index.ts` for reference wiring.
