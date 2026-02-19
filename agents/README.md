# Specialized Agent Templates

This directory houses the scaffolding for the downstream agents managed by the Orchestrator. Every template includes:

1. **Config stub** describing required environment variables and orchestrator wiring.
2. **Executable entry point** (TypeScript) with hooks into shared telemetry utilities.
3. **Runbook** clarifying triggers, expected inputs/outputs, and escalation paths.

Current templates:

- [`doc-specialist/`](./doc-specialist) – "Doc Doctor" responsible for reconciling doc drift and generating knowledge packs.
- [`reddit-helper/`](./reddit-helper) – Community responder that consumes queued Reddit questions and posts orchestrator-approved replies.

Telemetry helpers live under [`shared/`](./shared).
