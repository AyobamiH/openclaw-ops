# Agent Execution Contract (Hard Cutover)

Last updated: 2026-02-24
Scope: Spawned agents executed through `runSpawnedAgentJob()` in `orchestrator/src/taskHandlers.ts`.

## Canonical Contract

All orchestrator-managed spawned agents MUST follow this contract:

1. Read task payload from CLI arg path (`process.argv[2]`).
2. Write structured JSON result to the env-provided result file path.
3. Use result JSON field `success` as the authoritative outcome signal.
4. Exit code semantics:
   - `0`: handled execution path (both success and controlled business failure allowed)
   - non-zero: runtime/transport failure (agent crash, parse failure, unhandled exception)

## Orchestrator Interpretation

- `runSpawnedAgentJob()` treats non-zero exits as execution failures and throws.
- Handler logic interprets result payload and throws for failed business outcomes when required.
- Queue recording in `orchestrator/src/index.ts` persists:
  - `result: "ok"` for successful handler completion
  - `result: "error"` when handler throws

## Hard-Cutover Rule

This is a hard cutover with no backward compatibility.

Deprecated behavior is explicitly disallowed:
- Agent using non-zero exit to represent a normal/business `success:false` result.
- Handler returning `"...failed: ..."` strings instead of throwing.

Any agent/task still using deprecated semantics is non-compliant and must be updated to this contract.
