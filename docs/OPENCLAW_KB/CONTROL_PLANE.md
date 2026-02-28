# Control Plane & Orchestration Audit

Last updated: 2026-02-24

## Routing Authority
### Verified controls
- Task intake endpoint: `POST /api/tasks/trigger`
- Middleware chain: `apiLimiter -> authLimiter -> requireBearerToken -> schema validation`
- Queue allowlist enforcement: `TaskQueue.enqueue()` calls `validateTaskType()`
- Dispatch resolution: `resolveTaskHandler()` rejects unknown types to `unknownTaskHandler`

### Constraint
- Orchestrator is authoritative for API-driven routing, but **not exclusive globally** due to independent agent systemd services.

## Mission Lifecycle
1. Intake (HTTP/API or cron/watcher trigger)
2. Queue enqueue with UUID task ID
3. Dispatch by task type to handler
4. Handler executes inline or spawns agent process
5. Result/error appended to `state.taskHistory`
6. State persisted via `saveState()`

## State Transitions (Observed)
- Task status modeled as history records: `ok` | `error`
- No explicit finite state machine for mission-level states (queued/running/retrying/terminated as first-class entities)
- Retry behavior exists only where implemented in specific handler/agent logic
- Spawned-agent success/failure interpretation is hard-cutover and centralized in orchestrator handlers (no backward compatibility): `docs/OPENCLAW_KB/operations/AGENT_EXECUTION_CONTRACT.md`

## Escalation & Approval Flow
- Security posture checks on startup are hard-fail for missing critical env vars.
- Approval-related metrics exist, but no global runtime approval gate is enforced around all destructive operations.

## Findings
- **Medium**: No centralized mission state machine with strict transition validation.
- **High**: Control-plane exclusivity claim is false while standalone services remain active execution path.
- **Medium**: State mutation durability exists, but authenticity/non-repudiation controls are weak.
