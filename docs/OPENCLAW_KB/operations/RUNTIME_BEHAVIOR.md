# Runtime Behavior (Observed)

Last updated: 2026-02-24

## Startup Sequence
1. Security posture verification (critical env vars + API key rotation policy)
2. Config load + directory preparation
3. Agent registry discovery
4. Alerting + metrics init
5. Optional persistence/indexing/memory/knowledge startup (skippable with fast-start)
6. HTTP server startup and route registration
7. Startup task enqueue

## Scheduling
- Nightly batch
- Morning digest
- Periodic heartbeat
- Alert cleanup intervals
- Heartbeat hang detection interval

## Concurrency
- Queue concurrency is fixed to 2 via `p-queue`.

## Operational Caveats
- Fast-start mode bypasses heavy subsystems and is intended for controlled testing scenarios.
- Runtime behavior differs depending on direct service execution vs orchestrator dispatch.
- Spawned-agent outcome semantics follow a hard-cutover contract (no backward compatibility): see `docs/OPENCLAW_KB/operations/AGENT_EXECUTION_CONTRACT.md`.
