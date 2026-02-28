# Runtime Invariants and Risk Register

Last updated: 2026-02-24

## Invariants (Must Hold)

1. All privileged task entrypoints require auth/signature + validation.
2. Unknown task types are not silently accepted.
3. Agent executions are traceable to a queue task id.
4. Skill execution is enforced by central gate, not only local agent checks.
5. State mutations are durable and bounded.
6. Deployment mode does not bypass orchestrator governance.

## Current Compliance Snapshot

- Invariant 1: **Partially met** (API yes; internal enqueue path no global guard).
- Invariant 2: **Not met** (fallback handler accepts unknown type with message).
- Invariant 3: **Partially met** (task history exists; some standalone services bypass queue).
- Invariant 4: **Not met** (no runtime tool gate module).
- Invariant 5: **Partially met** (bounded state slices, but multi-store drift risk).
- Invariant 6: **Not met** (systemd standalone agent services present).

## Top Risks (Severity)

- **Critical**: Claimed `toolGate`/`skillAudit` runtime controls absent.
- **High**: Unmapped declared `orchestratorTask` values create governance drift.
- **High**: Standalone services can operate outside orchestrator policy boundary.
- **Medium**: Unknown task fallback behavior hides invalid route attempts.
- **Medium**: Compose/systemd mode divergence risks inconsistent security posture.

## Priority Remediation

1. Implement central runtime gate and make agent-side checks advisory only.
2. Enforce strict task mapping consistency checks in CI.
3. Route `doc-specialist` and `reddit-helper` service behavior through orchestrator-triggered jobs only.
4. Convert unknown task handling to explicit error + audit alert.
