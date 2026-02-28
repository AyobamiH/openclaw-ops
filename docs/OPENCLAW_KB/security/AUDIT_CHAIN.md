# Audit Chain Integrity

Last updated: 2026-02-24

## Current Audit Artifacts
- Task history in orchestrator state
- Security/event warnings from middleware
- Optional invocation logs in ToolGate
- Alerting + metrics streams

## Integrity Limitations
- State and logs are mutable local artifacts without tamper-evident signatures.
- Tool invocation audit is not guaranteed universal across all tool paths.

## Hardening Requirements
1. Immutable append-only audit sink for state mutations and approvals.
2. Correlate every mutation with `{taskId, agentId, actor, timestamp}`.
3. Periodic audit reconciliation job to detect missing links.
