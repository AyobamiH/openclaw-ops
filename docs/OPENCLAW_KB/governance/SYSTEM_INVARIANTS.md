# System Invariants (Safe Autonomy Guardrails)

Last updated: 2026-02-24

These are non-negotiable controls required for safe scale.

1. Orchestrator-mediated task intake is allowlist-only.
2. Unknown task types are rejected and auditable.
3. Protected APIs require bearer authentication.
4. Webhook ingress requires valid HMAC signature over canonical payload.
5. Every task result mutation is persisted with task ID and timestamp.
6. No skill/tool invocation may execute without policy evaluation.
7. Agent role permissions must be runtime-enforced, not declarative only.
8. Destructive operations require explicit approval gate before execution.
9. Mission chains require bounded depth/TTL to prevent runaway autonomy.
10. Cross-workspace writes are denied unless explicitly delegated and logged.

## Current Status
- Invariants 1-5: mostly enforced.
- Invariants 6-10: partially enforced; governance hardening required.
