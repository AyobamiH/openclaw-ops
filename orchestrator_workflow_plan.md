# Orchestrator Workflow Plan

## Step 1 – Job Specifications ✅

### 1. Docs Specialist (a.k.a. Doc Doctor)
- **Mission**: keep the OpenClaw knowledge base fresh and ensure agents stay aligned with the latest docs.
- **Inputs**: pending doc-change queue, diff summaries (future), orchestrator state snapshots.
- **Outputs**: structured updates (e.g., `doc-sync` completion logs), optional outbound notifications when significant changes occur.
- **Triggers**:
  - Automatic: new doc changes queued and awaiting consolidation.
  - Scheduled: daily drift audit even if no changes were detected.
- **Escalation**: if doc drift persists >24h, emit `drift-alert` task for human review.

### 2. Reddit Helper (Community Agent)
- **Mission**: answer OpenClaw questions in Reddit/Builder communities using orchestrator-approved knowledge.
- **Inputs**: curated question queue (from Reddit API or manual feed), current doc excerpts, orchestrator task payloads (`reddit-response`).
- **Outputs**: posted reply metadata (URL, timestamp, confidence), updates back to orchestrator state.
- **Triggers**:
  - Automatic: `reddit-response` tasks created when new questions arrive.
  - Scheduled: periodic heartbeat to check for unanswered queue items.
- **Escalation**: for uncertain answers, emit `reddit-escalate` task referencing the question link.

### 3. Future Specialized Agents (Template)
- **Mission**: handle targeted workflows (e.g., release notes bot, private beta concierge) spun up by orchestrator.
- **Inputs/Outputs**: defined per agent but must report status via orchestrator task history.
- **Lifecycle**: orchestrator emits `agent-deploy` and `agent-retire` tasks, and monitors health via `agent-heartbeat`.

## Step 2 – Wire Task Types → Actions ✅
- Added `drift-repair`, `reddit-response`, and `agent-deploy` handlers in `src/taskHandlers.ts` with proper logging + state updates.
- Expanded `OrchestratorState` to track `driftRepairs`, `redditQueue`, `redditResponses`, and `agentDeployments`, plus last-run timestamps.
- Scheduler now enqueues `reddit-response` sweeps every 10 minutes (see `src/index.ts`).
- `npm run build` succeeds with the new types + handlers.

## Step 3 – Agent Templates & Instrumentation ✅
- Created `agents/` workspace with shared telemetry helper and dedicated folders for Doc Specialist and Reddit Helper.
- Each agent ships with README (mission, flow, escalation), sample `agent.config.json`, and TypeScript entry point wired to telemetry.
- Added knowledge-pack artifact path + Reddit queue hooks so the Orchestrator can deploy via the new `agent-deploy` handler.
- `agent-deploy` now scaffolds from these templates into `agents-deployed/` (local workspace option).
