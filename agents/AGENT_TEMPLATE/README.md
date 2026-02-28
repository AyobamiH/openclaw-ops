# Agent Template - Copy and Customize

Status: Template scaffold
Primary orchestrator task: define in `agent.config.json`
Canonical contract: `agent.config.json`, `src/index.ts`, and local governance files

## Purpose

Use this directory as the baseline for creating a new OpenClaw agent with the
required runtime contract, memory keys, and governance surface already in place.

## Contract

### Required files

- `agent.config.json`
- `ROLE.md`
- `SCOPE.md`
- `POLICY.md`
- `TOOLS.md`
- `README.md`

Recommended supporting files:

- `SOUL.md`
- `IDENTITY.md`
- `USER.md`
- `HEARTBEAT.md`
- `src/index.ts`
- `src/service.ts`

### Required config baseline

Every new agent must keep these baseline config keys:

- `orchestratorStatePath`
- `serviceStatePath`

Domain-specific memory paths such as `knowledgePackDir`, `draftLogPath`, or
`devvitQueuePath` can be added, but they do not replace the baseline memory
contract.

## Setup

1. Copy the template.
2. Update `agent.config.json` with the real `id`, `name`, `description`, task
   mapping, and allowed skills.
3. Implement the runtime entrypoint in `src/index.ts`.
4. Add the handler wiring in `orchestrator/src/taskHandlers.ts` and agent
   registration if the new agent is meant to run through the orchestrator.
5. Validate locally before relying on the new agent in shared flows.

```bash
cp -r agents/AGENT_TEMPLATE agents/my-new-agent
cd agents/my-new-agent
npm install
npm test
```

## Runtime

The template ships with a local script surface:

- `npm run dev`
- `npm run build`
- `npm test`

Use these scripts as the default starting point, then tighten them for the new
agent's real runtime.

## Governance

- Local governance primitives in this folder remain mandatory.
- Canonical policy authority is `../../docs/GOVERNANCE_REPO_HYGIENE.md`.
- A new agent should not be treated as active until its `agent.config.json`,
  task wiring, and README all agree on scope and boundaries.
