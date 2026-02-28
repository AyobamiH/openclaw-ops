# CLAWDBOT Milestone Delivery Plan

Status: Draft (mapped to current runtime reality)
Last updated: 2026-02-27
Owners: orchestrator + reddit-helper + openclawdbot

## Goal

Display verified internal milestone updates in the Reddit app (`openclawdbot`) using milestone data defined by `docs/CLAWDBOT_MILESTONES.md`.

## Reality Map (Current State)

### What already exists

1. Milestone specification and rules:
   - `docs/CLAWDBOT_MILESTONES.md`
2. Draft/queue producer path:
   - `agents/reddit-helper/src/index.ts` and `src/service.ts` append to `devvitQueuePath`
   - default path from config: `logs/devvit-submissions.jsonl`
3. Devvit app exists:
   - `openclawdbot/` with server routes and Reddit trigger wiring

### What is missing

1. No runtime milestone emitter in orchestrator/agents/scripts (spec exists, emitter does not).
2. No consumer/bridge that reads `logs/devvit-submissions.jsonl` (or milestone queue) and posts to Reddit app channels.
3. `openclawdbot` route wiring has mismatch:
   - `devvit.json` includes `/internal/menu/example-form`
   - `src/server/routes/menu.ts` does not implement that route.

## Target Flow

1. Milestone event emitted (validated against spec).
2. Event appended to `logs/milestones.jsonl`.
3. Delivery bridge queues event into `logs/milestone-delivery-queue.jsonl`.
4. Bridge calls `openclawdbot` internal ingest endpoint with signed payload.
5. `openclawdbot` stores/serves milestone feed for client UI.
6. Delivery state updates with idempotent ack and retry metadata.

## Required Scaffolding

### 1) Shared Milestone Schema

- Add shared TypeScript schema/types (Zod + static types).
- Canonical fields:
  - `milestoneId`
  - `timestampUtc`
  - `scope`
  - `claim`
  - `evidence[]`
  - `riskStatus`
  - `nextAction`

Suggested location:

- `workspace/orchestrator/src/milestones/schema.ts`
- optional shared copy for app contracts in `workspace/openclawdbot/src/shared/`

### 2) Runtime Artifacts

Add files under `workspace/logs/`:

- `milestones.jsonl` (source-of-record events)
- `milestone-delivery-queue.jsonl` (pending deliveries)
- `milestone-delivery-state.json` (cursor, retries, last ack)
- `milestone-delivery-deadletter.jsonl` (failed max-retry events)

### 3) Emitter

Add emitter utility:

- `orchestrator/src/milestones/emitter.ts`

Initial emit paths:

- manual operator command/script
- selected orchestrator handlers (e.g. `nightly-batch`, major validation milestones)

### 4) Delivery Bridge

Add bridge worker (script or service):

- `scripts/deliver_milestones_to_clawdbot.ts` (or orchestrator-managed task)

Responsibilities:

- read queue
- sign payload
- POST to app endpoint
- ack/retry/dead-letter
- write metrics/logs

### 5) openclawdbot Ingestion + Feed

Server additions:

- `POST /internal/milestones/ingest` (signed, idempotent)
- `GET /api/milestones/latest` (UI consumption)

Client additions:

- milestone panel/list in `src/client/game.tsx` or dedicated view.

### 6) Security

Required env/config:

- `CLAWDBOT_MILESTONE_WEBHOOK_SECRET` (shared secret)
- timestamp + signature validation
- replay window + idempotency key checks

### 7) Tests

Minimum tests:

1. schema validation pass/fail
2. duplicate milestone id is ignored/idempotent
3. bad signature rejected
4. end-to-end: emit -> queue -> ingest -> feed visible

## Implementation Sequence

### Phase 1 (Foundation)

1. Add schema + milestone files.
2. Add manual emit script.
3. Add basic ingestion endpoint with signature validation.

### Phase 2 (Delivery)

1. Add delivery bridge with retry/dead-letter.
2. Add state file/cursor handling.

### Phase 3 (UI + Runtime Integration)

1. Add milestone feed UI in `openclawdbot`.
2. Wire orchestrator handlers to emit milestone events.

### Phase 4 (Hardening)

1. Metrics + alerts for failed delivery.
2. Documentation and operator runbook.

## Execution Checklist (Sprint B/C)

Status key: `[ ] not started`, `[-] in progress`, `[x] complete`

- [x] Shared schema scaffold added (`orchestrator/src/milestones/schema.ts`)
- [x] App-side contract scaffold added (`openclawdbot/src/shared/milestones.ts`, `openclawdbot/src/server/contracts/milestones.ts`)
- [x] Ingest contract documented (`docs/operations/MILESTONE_INGEST_CONTRACT.md`)
- [ ] Emitter implementation (`orchestrator/src/milestones/emitter.ts`)
- [ ] Delivery bridge implementation (`scripts/deliver_milestones_to_clawdbot.ts`)
- [ ] Ingest route activation (`POST /internal/milestones/ingest`)
- [ ] Feed route activation (`GET /api/milestones/latest`)
- [ ] Idempotency/replay guard implementation
- [ ] End-to-end tests (emit -> queue -> ingest -> feed)
- [ ] Ops runbook update with on-call checks for milestone pipeline

## Non-Negotiables

1. No milestone publication without required evidence fields.
2. No duplicate post on retries (idempotency required).
3. No unsigned ingestion accepted.
4. Keep alignment with:
   - `docs/CLAWDBOT_MILESTONES.md`
   - `OPENCLAW_CONTEXT_ANCHOR.md`
   - `docs/GOVERNANCE_REPO_HYGIENE.md`
