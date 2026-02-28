# OPENCLAW_KB

Status: Secondary reference set
Last classified: 2026-02-28

`docs/OPENCLAW_KB/` is a knowledge-pack style reference bundle. It is useful for
deep orientation, governance synthesis, and evidence-backed explanation, but it
is not the first place to resolve operational truth.

## Precedence

When there is any conflict, use this order:

1. code and config
2. `../README.md` and `../../OPENCLAW_CONTEXT_ANCHOR.md`
3. canonical active docs under `../` and `../operations/`
4. this KB set

That means the KB stays valuable, but it should be treated as a synthesized
secondary layer rather than the canonical runtime contract.

The per-file status register lives in `CLASSIFICATION.md`.

## Why This Set Still Exists

Keep this set because it:

- captures cross-cutting reasoning that is harder to express in narrow runbooks
- preserves evidence-style snapshots of runtime/governance understanding
- provides a deeper onboarding and review surface for architecture analysis

Do not use it as the sole authority for live operational decisions without
checking the current code and the canonical docs surface.

## File Map

Core current snapshots:

- `00_SYSTEM_TRUTH.md`
- `01_CONTROL_PLANE.md`
- `02_GATEWAY_AND_POLICY.md`
- `03_AGENT_ISOLATION.md`
- `04_SKILLS_AND_SUPPLY_CHAIN.md`
- `05_MEMORY_CONTEXT_PERSISTENCE.md`
- `06_LIFECYCLE_AND_SCHEDULING.md`
- `07_INVARIANTS_AND_RISKS.md`
- `08_CLAIMS_VS_REALITY.md`

Consolidated generated summaries:

- `ARCHITECTURE.md`
- `AGENT_ROLES.md`
- `QA_VERIFICATION_MATRIX.md`

Operational references:

- `operations/AGENT_EXECUTION_CONTRACT.md`
- `operations/FAILURE_MODES.md`
- `operations/HEALTH_MONITORING.md`
- `operations/LIVE_3000_DISPATCH_RUNBOOK.md`
- `operations/RECOVERY_PROCEDURES.md`
- `operations/RUNTIME_BEHAVIOR.md`

Governance references:

- `governance/APPROVAL_GATES.md`
- `governance/DELEGATION_RULES.md`
- `governance/DRIFT_PREVENTION.md`
- `governance/SAFETY_BOUNDARIES.md`
- `governance/SYSTEM_INVARIANTS.md`

Security references:

- `security/AUDIT_CHAIN.md`
- `security/CREDENTIAL_BOUNDARIES.md`
- `security/NETWORK_CONTROLS.md`
- `security/POLICY_ENFORCEMENT.md`

## Audit Position

This directory is kept, not retired. Its entrypoint classification is current,
and its historical drift has now been reduced by rewriting the previously stale
core snapshots and consolidating the repetitive generated layer. It is still a
secondary reference set, so code and canonical docs continue to win on conflict.

That file-by-file review is now tracked in `CLASSIFICATION.md`.
