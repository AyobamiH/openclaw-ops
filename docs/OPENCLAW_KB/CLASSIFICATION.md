# OPENCLAW_KB Classification Register

Status: Active classification register
Last reviewed: 2026-02-28

This file records the per-document classification for `docs/OPENCLAW_KB/**`
after a code-based freshness review against the current orchestrator and skill
runtime.

Review basis:

- `orchestrator/src/taskHandlers.ts`
- `orchestrator/src/taskQueue.ts`
- `orchestrator/src/middleware/validation.ts`
- `orchestrator/src/toolGate.ts`
- `orchestrator/src/skillAudit.ts`
- `skills/index.ts`

Classification meanings:

- `current`: still useful as a live reference snapshot
- `generated`: synthesized or derivative summary/checklist layer; useful, but
  secondary to the more direct snapshots and code

## Current

| Path | Why it is current |
|---|---|
| `README.md` | Current entrypoint for how the KB should be used |
| `CLASSIFICATION.md` | Current per-file classification register |
| `00_SYSTEM_TRUTH.md` | Rewritten against the current orchestrator, task, and gating model |
| `01_CONTROL_PLANE.md` | Rewritten against the current deny-by-default task and control-plane behavior |
| `02_GATEWAY_AND_POLICY.md` | API/auth/validation analysis still broadly matches the current middleware stack |
| `03_AGENT_ISOLATION.md` | Rewritten to reflect the currently wired agent task surface |
| `04_SKILLS_AND_SUPPLY_CHAIN.md` | Rewritten to reflect the current ToolGate and SkillAudit implementation |
| `05_MEMORY_CONTEXT_PERSISTENCE.md` | Storage and durability notes still align with the present runtime surfaces |
| `06_LIFECYCLE_AND_SCHEDULING.md` | Startup and scheduling shape still matches the current orchestrator lifecycle |
| `07_INVARIANTS_AND_RISKS.md` | Rewritten to the current compliance and risk state |
| `08_CLAIMS_VS_REALITY.md` | Rewritten to reflect today’s implementation rather than older gaps |
| `AGENT_ROLES.md` | Role-boundary analysis remains directionally accurate and still useful |
| `operations/AGENT_EXECUTION_CONTRACT.md` | Active spawned-agent contract used by current task handlers |
| `operations/FAILURE_MODES.md` | Failure categories remain aligned with the current runtime |
| `operations/HEALTH_MONITORING.md` | Implemented health signals still describe the current monitoring layer |
| `operations/LIVE_3000_DISPATCH_RUNBOOK.md` | Current procedural runbook for the live dispatch validation path |
| `operations/RUNTIME_BEHAVIOR.md` | Observed runtime behavior still matches the current orchestrator shape |
| `governance/APPROVAL_GATES.md` | Normative guardrail set still applies to the current repo |
| `governance/DELEGATION_RULES.md` | Delegation rules remain valid and aligned with the intended control model |
| `governance/DRIFT_PREVENTION.md` | Drift controls remain current as policy guidance |
| `governance/SAFETY_BOUNDARIES.md` | Boundary framing remains current as a governance reference |
| `governance/SYSTEM_INVARIANTS.md` | Core invariants remain the active safety baseline |
| `security/AUDIT_CHAIN.md` | Audit-chain weaknesses still reflect the present state |
| `security/CREDENTIAL_BOUNDARIES.md` | Credential inheritance concerns remain current |
| `security/NETWORK_CONTROLS.md` | Network-control analysis remains current at the policy layer |
| `security/POLICY_ENFORCEMENT.md` | Enforcement gaps remain relevant to the current runtime |

## Generated

| Path | Why it is generated |
|---|---|
| `ARCHITECTURE.md` | Consolidated architecture summary that now absorbs the older repetitive generated overviews |
| `QA_VERIFICATION_MATRIX.md` | Matrix-style synthesized audit summary |
| `operations/RECOVERY_PROCEDURES.md` | Checklist-style response guide derived from the broader governance analysis |

Generated files are still useful, but they should be treated as convenience
views, not first-line proof.

## Action Rule

When touching the KB in the future:

1. Update this register first if a file changes classification.
2. Keep `generated` files concise and derivative; do not let them become the
   sole source of truth.
3. When a current file drifts materially, either rewrite it against code or
   explicitly demote it again rather than leaving it ambiguous.
