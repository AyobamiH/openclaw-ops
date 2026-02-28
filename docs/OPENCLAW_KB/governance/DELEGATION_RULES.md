# Delegation Rules

Last updated: 2026-02-24

## Required Delegation Model
- Intake: only orchestrator endpoints and internal schedulers may create tasks.
- Dispatch: only orchestrator may map task type -> execution handler.
- Execution: agents execute payload scoped by task ID and delegated role.

## Runtime Checks Required
- Agent identity binding to task ID.
- Role-to-skill authorization at invocation time.
- Filesystem/network scope check at call-time.

## Violations Observed
- Standalone service execution can occur outside orchestrator routing.
- Child process spawn paths do not uniformly enforce role/file/network boundaries.

## Rule Updates for Safe Operation
1. Disable autonomous direct-start services in production unless explicitly approved and isolated.
2. Add delegation token (task-id + agent-id + expiry) required for every skill call.
3. Reject executions lacking delegation token provenance.
