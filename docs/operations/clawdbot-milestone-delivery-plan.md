# CLAWDBOT Milestone Delivery Plan

Status: Partially implemented and active
Last updated: 2026-02-28
Owners: orchestrator + openclawdbot maintainers

## Goal

Display verified internal milestone updates inside `openclawdbot` using the
shared milestone schema and the signed ingest path.

## Current Reality

### Implemented

1. Shared milestone schema exists:
   - `orchestrator/src/milestones/schema.ts`
   - `openclawdbot/src/shared/milestones.ts`
2. Orchestrator emission exists:
   - `orchestrator/src/milestones/emitter.ts`
3. Feed publishing exists:
   - `orchestrator/src/milestones/feed-publisher.ts`
4. Runtime delivery exists through the emitter:
   - signed POST to `/internal/milestones/ingest`
   - retry states
   - duplicate handling
   - dead-letter state
5. App ingestion and feed routes exist:
   - `POST /internal/milestones/ingest`
   - `GET /api/milestones/latest`
   - `GET /api/milestones/dead-letter`
6. App UI consumption exists:
   - `splash.tsx`
   - `game.tsx`
   - `useMilestoneFeed.ts`
7. Orchestrator-side milestone tests exist:
   - `orchestrator/test/milestones.test.ts`
   - `orchestrator/test/milestones.e2e.test.ts`

### Not Implemented Or Still Open

1. There is no separate standalone bridge script under `scripts/`; the
   orchestrator emitter handles delivery directly instead.
2. Not every meaningful runtime path emits milestones yet; the current emission
   set is selective, not exhaustive.
3. Docs and public navigation still needed alignment after the implementation
   moved ahead of earlier planning docs.
4. Full end-to-end validation against a live published Reddit app remains partly
   gated by the Devvit review/publish process.

## Actual Flow

1. A runtime event occurs.
2. `MilestoneEmitter.emit()` validates the event.
3. The event is appended to `logs/milestones.jsonl`.
4. A `MilestoneDeliveryRecord` is added to orchestrator state.
5. `deliverPending()` sends an HMAC-signed request to the app ingest route.
6. `openclawdbot` verifies, deduplicates, stores, and broadcasts the event.
7. The client reads the current feed and receives live updates through the
   realtime channel.

## Execution Checklist

Status key: `[ ] not started`, `[-] partial`, `[x] complete`

- [x] Shared schema scaffold
- [x] App-side shared contract
- [x] Orchestrator emitter
- [x] App ingest route
- [x] App feed route
- [x] Duplicate-safe ingestion
- [x] Rejection and dead-letter visibility
- [x] Orchestrator-side milestone tests
- [-] Broad milestone coverage across more runtime workflows
- [-] Public docs fully aligned to the implemented flow
- [-] Live published app validation beyond upload/review submission
- [ ] Separate bridge script (not currently needed if the emitter remains the
  canonical bridge)

## Keep / Drop Decision On The Standalone Bridge

### Why we do not need it right now

The original plan assumed a dedicated external bridge worker. The current code
already performs that delivery inside the orchestrator emitter, so adding a
second bridge path would duplicate logic.

### Why we might still add it later

A standalone bridge may still make sense if:

- delivery must be decoupled from orchestrator runtime uptime
- queue draining needs an independent worker lifecycle
- milestone fan-out grows beyond the current single-target model

## Remaining Work

1. Expand milestone emission coverage to more meaningful task outcomes.
2. Keep docs aligned with the implemented direct-delivery design.
3. Decide explicitly whether the standalone bridge is retired or deferred.
4. Continue platform-side publish/review work for the Reddit app.
