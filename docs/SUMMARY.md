---
title: "Documentation Summary"
summary: "Current status summary for the first-party docs set."
---

# Documentation Summary

This file summarizes the current state of the first-party OpenClaw docs after the
2026-02-28 audit.

## Current State

- Canonical navigation docs now point only to files that exist.
- Milestone pipeline docs now reflect the code that is actually running.
- Historical snapshot docs are still present, but they are no longer presented
  as active truth.
- The main remaining docs work is deeper freshness review, not major structural
  rebuilding.

## Primary Documents

| Category | Start Here |
|---|---|
| Repo overview | [../README.md](../README.md) |
| Runtime truth | [../OPENCLAW_CONTEXT_ANCHOR.md](../OPENCLAW_CONTEXT_ANCHOR.md) |
| Docs navigation | [INDEX.md](./INDEX.md) |
| By-role routing | [NAVIGATION.md](./NAVIGATION.md) |
| Audit / stale classification | [operations/DOCUMENT_AUDIT.md](./operations/DOCUMENT_AUDIT.md) |

## Active Runtime Docs

- [OPERATOR_GUIDE.md](./OPERATOR_GUIDE.md)
- [guides/configuration.md](./guides/configuration.md)
- [reference/task-types.md](./reference/task-types.md)
- [reference/state-schema.md](./reference/state-schema.md)
- [operations/SPRINT_TO_COMPLETION.md](./operations/SPRINT_TO_COMPLETION.md)

## Active Milestone Pipeline Docs

- [CLAWDBOT_MILESTONES.md](./CLAWDBOT_MILESTONES.md)
- [operations/MILESTONE_INGEST_CONTRACT.md](./operations/MILESTONE_INGEST_CONTRACT.md)
- [operations/MILESTONE_PIPELINE_RUNBOOK.md](./operations/MILESTONE_PIPELINE_RUNBOOK.md)
- [operations/clawdbot-milestone-delivery-plan.md](./operations/clawdbot-milestone-delivery-plan.md)

## Historical Docs Still Kept

These remain in the repo because they preserve earlier phase evidence, but they
are not the primary operating surface:

- [../DOCUMENTATION_COMPLETE.md](../DOCUMENTATION_COMPLETE.md)
- [../IMPLEMENTATION_COMPLETE.md](../IMPLEMENTATION_COMPLETE.md)
- [../orchestrator_documentation.md](../orchestrator_documentation.md)
- [../orchestrator_status.md](../orchestrator_status.md)
- [../orchestrator_workflow_plan.md](../orchestrator_workflow_plan.md)

## Remaining Work

1. Deeper freshness review for `docs/OPENCLAW_KB/**`
2. Subproject doc link pass (`orchestrator/`, `openclawdbot/`, agents)
3. Final repo-wide closure work tracked in
   [operations/SPRINT_TO_COMPLETION.md](./operations/SPRINT_TO_COMPLETION.md)
