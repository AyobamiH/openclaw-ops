# Specialized Agent Templates

This directory houses the scaffolding for the downstream agents managed by the Orchestrator. Every template includes:

1. **Config stub** describing required environment variables and orchestrator wiring.
2. **Executable entry point** (TypeScript) with hooks into shared telemetry utilities.
3. **Runbook** clarifying triggers, expected inputs/outputs, and escalation paths.

Current templates:

- [`doc-specialist/`](./doc-specialist) – "Doc Doctor" responsible for reconciling doc drift and generating knowledge packs.
- [`reddit-helper/`](./reddit-helper) – Community responder that consumes queued Reddit questions and posts orchestrator-approved replies.

Telemetry helpers live under [`shared/`](./shared).

## Memory Contract (Mandatory for all agents)

Every agent must include these config keys in `agent.config.json`:

- `orchestratorStatePath`
- `serviceStatePath`

Why this is mandatory:

- Enables persistent cross-run memory continuity.
- Guarantees each agent has a durable execution timeline and status history.
- Supports operator auditability and replay-friendly diagnostics.

Runtime standard:

- Orchestrator updates each spawned agent `serviceStatePath` with memory state (`lastRunAt`, `lastStatus`, task IDs/types, counters, and bounded timeline history).
- Agents with richer pipelines may define additional memory IO keys (for example `knowledgePackDir`, `draftLogPath`, `devvitQueuePath`) but cannot omit the baseline memory contract above.
