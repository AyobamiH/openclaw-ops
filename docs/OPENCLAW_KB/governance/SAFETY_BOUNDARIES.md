# Safety Boundaries

Last updated: 2026-02-24

## Boundaries Expected
- Control plane boundary: orchestrator-only routing authority.
- Gateway boundary: all external ingress validated/authenticated.
- Execution boundary: every tool/skill invocation policy-gated.
- Data boundary: state/log writes auditable and integrity-protected.

## Verified Strengths
- API ingress controls are explicit and tested.
- Task type and schema guards reduce unsafe payloads.

## Boundary Breaks/Weak Zones
- Direct agent services can bypass orchestrator mediation.
- Local host/process privileges can mutate state artifacts outside API path.
- Tool gate not yet proven universal across all execution pathways.
