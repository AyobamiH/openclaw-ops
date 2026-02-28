# CLAWDBOT Milestones

Milestone policy for the OpenClaw runtime and the `openclawdbot` milestone
surface.

## Purpose

Define:

- when a milestone should be emitted
- what fields it must contain
- what evidence standards still apply
- how the policy maps to the current runtime schema

## Canonical Schema

The active runtime schema is implemented in:

- `workspace/orchestrator/src/milestones/schema.ts`
- `workspace/openclawdbot/src/shared/milestones.ts`

The current required fields are:

1. `milestoneId`
2. `timestampUtc`
3. `scope`
4. `claim`
5. `evidence[]`
6. `riskStatus`
7. `nextAction`
8. `source` (optional: `orchestrator`, `agent`, `operator`)

## Current `riskStatus` Values

These are the live values accepted by the app and runtime:

- `on-track`
- `at-risk`
- `blocked`
- `completed`

Older labels such as `none`, `known`, and `deferred` are not the active
app-facing contract.

## When To Emit A Milestone

Emit a milestone when one of these happens:

1. Runtime validation or startup state changes
2. Control-plane hardening or deploy actions
3. Knowledge or pipeline repair actions
4. Incident detection or remediation
5. Meaningful operator-visible workflow completions

## Evidence Standard

The evidence rule still stands:

- no milestone without concrete evidence
- no broader claim than the evidence supports

Evidence items should point to:

- file paths
- test results
- log artifacts
- generated outputs
- verifiable operational records

## Practical Template

```json
{
  "milestoneId": "runtime.validation.example",
  "timestampUtc": "2026-02-28T12:34:56.000Z",
  "scope": "runtime",
  "claim": "Orchestrator started successfully.",
  "evidence": [
    {
      "type": "log",
      "path": "workspace/orchestrator_state.json",
      "summary": "lastStartedAt set in orchestrator state"
    }
  ],
  "riskStatus": "on-track",
  "nextAction": "Monitor task queue for first incoming tasks.",
  "source": "orchestrator"
}
```

## Guardrails

Milestones are invalid when:

1. evidence is missing or vague
2. the claim is broader than the attached proof
3. the selected `riskStatus` hides known unresolved issues
4. governance-sensitive claims skip required hygiene classification

## Current Runtime Reality

The milestone path is no longer just planned.

Current code already includes:

- orchestrator-side emission
- signed delivery attempts
- retry and dead-letter states
- app-side ingest and feed routes
- duplicate-safe ingestion

Use these companion docs for the operational details:

- `docs/operations/MILESTONE_INGEST_CONTRACT.md`
- `docs/operations/MILESTONE_PIPELINE_RUNBOOK.md`
- `docs/operations/clawdbot-milestone-delivery-plan.md`
