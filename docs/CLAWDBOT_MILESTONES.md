# CLAWDBOT_MILESTONES

Milestone specification for OpenClaw operator-facing progress posts and auditability.

## 1) Purpose

Define when a milestone is emitted, what must be included, and which evidence is mandatory.

This spec is intentionally strict:

- No milestone without evidence links.
- No “done” claims without verification artifact references.
- No cleanup/removal milestones without hygiene classification from `docs/GOVERNANCE_REPO_HYGIENE.md`.

## 2) Milestone Triggers

Emit a milestone when one of the following happens:

1. Runtime validation milestone
   - Example: 3000-task production-semantics run completed with reported SLA.
2. Control-plane hardening milestone
   - Example: auth/approval/idempotency/persistence boundary changes merged and validated.
3. Knowledge-pipeline integrity milestone
   - Example: sync + index + pack production/consumption chain verified end-to-end.
4. Governance milestone
   - Example: protected allowlist regenerated and junk inventory re-scored.
5. Incident/remediation milestone
   - Example: regression detected, root cause identified, fix validated.

## 3) Required Milestone Structure

Every milestone post must include all fields in this order:

1. `Milestone ID` (stable slug)
2. `Timestamp (UTC)`
3. `Scope` (runtime, pipeline, governance, incident)
4. `Claim` (single-sentence outcome)
5. `Evidence` (file/command/test artifacts)
6. `Risk Status` (`none`, `known`, `deferred`)
7. `Next Action` (single actionable follow-up)

## 4) Post Template

Use this template exactly:

```markdown
## Milestone: <id>
- Timestamp (UTC): <YYYY-MM-DDTHH:MM:SSZ>
- Scope: <runtime|pipeline|governance|incident>
- Claim: <single sentence>
- Evidence:
  - <artifact 1>
  - <artifact 2>
  - <artifact 3>
- Risk Status: <none|known|deferred>
- Next Action: <single next action>
```

## 5) Guardrails

Milestones are invalid if any condition below is violated:

1. Evidence is missing, hand-wavy, or not reproducible.
2. Claim is broader than evidence scope.
3. Risk status omits known unresolved failures.
4. Governance claims skip allowlist derivation sequence.
5. Cleanup claims do not include candidate/drift-risk classification.

## 6) Evidence Attachment Format

Each evidence item should be one of:

- File evidence: `path + line reference`
  - Example: `workspace/orchestrator/src/index.ts#L122-L131`
- Command evidence: `command + short result`
  - Example: `npm run test:integration -> passed`
- Runtime artifact evidence:
  - Example: `logs/knowledge-packs/<pack-id>.json generated`

Minimum evidence count by scope:

- runtime: 3 artifacts
- pipeline: 3 artifacts
- governance: 4 artifacts
- incident: 4 artifacts (must include root-cause + verification)

## 7) Milestone Types (Canonical IDs)

- `runtime.validation.<topic>`
- `runtime.hardening.<topic>`
- `pipeline.knowledge.<topic>`
- `governance.hygiene.<topic>`
- `incident.remediation.<topic>`

Example IDs:

- `runtime.validation.3000-task-production-semantics`
- `governance.hygiene.protected-allowlist-rerun`

## 8) Governance-Coupled Rule

If a milestone touches cleanup, drift repair, mirror inputs, logs, or memory paths, it must cite:

- `docs/GOVERNANCE_REPO_HYGIENE.md`
- current protected allowlist snapshot (or regeneration output)
- explicit classification outcome (`PROTECTED`, `PROTECTED-BUT-PRUNABLE`, `CANDIDATE`, `DRIFT-RISK`)

## 9) Lightweight Review Checklist

Before posting, verify:

- Claim sentence matches evidence exactly.
- Evidence references are clickable and current.
- Any failing or flaky tests are disclosed under Risk Status.
- Next Action is concrete and bounded.

## 10) Runtime Mapping + Delivery Plan

This file defines milestone policy and structure. The implementation mapping and delivery scaffolding are tracked in:

- `docs/operations/clawdbot-milestone-delivery-plan.md`

Current status reminder:

- Milestone spec exists (this file).
- Runtime emitter + delivery bridge to Reddit app are planned but not yet fully implemented in control-plane code.
