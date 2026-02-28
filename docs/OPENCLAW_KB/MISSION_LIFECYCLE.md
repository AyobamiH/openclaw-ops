# Mission Lifecycle Trace (Verified)

Last updated: 2026-02-24

## End-to-End Flow
1. Mission/task intake
   - API: `POST /api/tasks/trigger`
   - Internal: cron jobs (`nightly-batch`, `send-digest`, `heartbeat`)
   - Internal: doc watcher emits `doc-change`
2. Intake validation
   - auth/signature/rate limit/schema
   - task type allowlist
3. Queueing
   - `TaskQueue.enqueue()` creates task ID + createdAt
4. Dispatch
   - `resolveTaskHandler(task)` selects handler or unknown handler
5. Execution
   - inline logic or child process spawn (`runSpawnedAgentJob`)
6. Result recording
   - `recordTaskResult(... ok|error ...)`
   - `saveState()` persists bounded history
7. Alerting
   - failure tracker triggers alerts after threshold breaches

## Delegation Checkpoints
- Task type validation at API and queue boundaries
- Handler-level spawn routing by explicit agent IDs

## Approval/Validation Checkpoints
- Request auth + validation present
- No universal explicit approval gate for all destructive operations

## Loop/Recursion Risk Review
- Cron tasks are bounded by schedule.
- Queue processing concurrency fixed (`2`).
- Potential chaining risk remains if handlers enqueue each other without global max-depth/token.
- No global mission TTL/hop-count guard observed.

## Termination Behavior
- Graceful shutdown exists (`SIGTERM` + timeout force kill).
- Per-task timeout only in some spawned-agent pathways.

## Findings
- **Medium**: Missing global anti-recursion / max-chain-depth guarantee.
- **Medium**: Lifecycle completeness relies on conventions, not single mission state machine.
