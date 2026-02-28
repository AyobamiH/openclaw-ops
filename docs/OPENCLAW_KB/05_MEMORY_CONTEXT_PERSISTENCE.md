# Memory, Context, and Persistence Boundaries

Last updated: 2026-02-24

## Verified State Stores

- File state: `orchestrator_state.json` managed by `state.ts`.
- Mongo persistence integration bootstrapped via `PersistenceIntegration.initialize()`.
- Logs/artifacts under `logs/` (knowledge packs, digests, draft records).

## Verified Controls

- State write truncation limits exist for key arrays (`taskHistory`, `driftRepairs`, `rssDrafts`, etc.).
- Corrupt state JSON falls back to default state with warning.
- Persistence startup failure does not crash orchestrator (degraded mode).

## Integrity Risks

- Degraded mode fallback can hide persistence outages if not externally alerted.
- Mixed authority for state-like outputs (orchestrator state vs JSONL logs vs Mongo) can diverge.
- No explicit schema migration/versioning strategy beyond loose defaults.

## Governance Invariants

1. State of record for queue and lifecycle remains `orchestrator_state.json` unless explicit migration policy is approved.
2. Every asynchronous write artifact should include task id + timestamp correlation.
3. Persistence degraded mode must emit high-severity alert after startup and periodically until recovered.
