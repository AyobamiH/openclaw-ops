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
2. Demand intake or queue state changes (`rss-sweep`, demand summary refresh)
3. Governance changes (approval requested, approved, rejected)
4. Control-plane hardening or deploy actions
5. Knowledge or pipeline repair actions
6. Incident detection or remediation
7. Meaningful operator-visible workflow completions (`nightly-batch`, `reddit-response`)

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
- runtime milestones for startup, `rss-sweep`, `nightly-batch`, `reddit-response`,
  approval state changes, and demand summary refreshes

## Parallel Demand Telemetry

Milestones remain the **Proof** channel.

The Demand view now also has a separate signed structured telemetry path for
queue and draft pressure. That demand summary channel:

- is delivered in parallel to milestones
- uses `POST /internal/demand/ingest`
- stores only the latest verified demand snapshot in the app
- powers `/api/command-center/demand` and `/api/command-center/demand-live`
- reuses the same signing secret model as milestone ingest by default

This means:

- use milestones for narrative proof, evidence, and next actions
- use demand summaries for live queue totals, draft totals, readiness, top
  pillars, and active demand segments

Do not overload the milestone schema with structured demand counters.

Use these companion docs for the operational details:

- `docs/operations/MILESTONE_INGEST_CONTRACT.md`
- `docs/operations/MILESTONE_PIPELINE_RUNBOOK.md`
- `docs/operations/clawdbot-milestone-delivery-plan.md`
