---
title: "Documentation Navigation"
summary: "Role-based paths through the current first-party docs."
---

# Documentation Navigation

Use this file when you know your goal but not the right document.

For the canonical file map, start with [INDEX.md](./INDEX.md).

When implementation changes materially, update the appropriate existing `.md`
file in the same change set and cross-reference the relevant code/config paths
where it helps prevent drift.

## I Need Current Runtime Truth

1. [../OPENCLAW_CONTEXT_ANCHOR.md](../OPENCLAW_CONTEXT_ANCHOR.md)
2. [OPERATOR_GUIDE.md](./OPERATOR_GUIDE.md)
3. [reference/state-schema.md](./reference/state-schema.md)
4. [reference/task-types.md](./reference/task-types.md)

## I Need To Operate Or Deploy The System

1. [../QUICKSTART.md](../QUICKSTART.md)
2. [../DEPLOYMENT.md](../DEPLOYMENT.md)
3. [operations/deployment.md](./operations/deployment.md)
4. [guides/monitoring.md](./guides/monitoring.md)
5. [operations/backup-recovery.md](./operations/backup-recovery.md)

## I Need To Understand The Architecture

1. [start/architecture-overview.md](./start/architecture-overview.md)
2. [concepts/architecture.md](./concepts/architecture.md)
3. [reference/api.md](./reference/api.md)

## I Need To Work On The Milestone Pipeline

1. [CLAWDBOT_MILESTONES.md](./CLAWDBOT_MILESTONES.md)
2. [operations/MILESTONE_INGEST_CONTRACT.md](./operations/MILESTONE_INGEST_CONTRACT.md)
3. [operations/MILESTONE_PIPELINE_RUNBOOK.md](./operations/MILESTONE_PIPELINE_RUNBOOK.md)
4. [operations/clawdbot-milestone-delivery-plan.md](./operations/clawdbot-milestone-delivery-plan.md)

## I Need To Close Remaining Gaps

1. [operations/SPRINT_TO_COMPLETION.md](./operations/SPRINT_TO_COMPLETION.md)
2. [operations/DOCUMENT_AUDIT.md](./operations/DOCUMENT_AUDIT.md)
3. [GOVERNANCE_REPO_HYGIENE.md](./GOVERNANCE_REPO_HYGIENE.md)

## I Need To Extend The Runtime

1. [guides/adding-tasks.md](./guides/adding-tasks.md)
2. [guides/configuration.md](./guides/configuration.md)
3. [guides/running-agents.md](./guides/running-agents.md)
4. [reference/api.md](./reference/api.md)

## I Need Help Troubleshooting

1. [troubleshooting/common-issues.md](./troubleshooting/common-issues.md)
2. [troubleshooting/debugging.md](./troubleshooting/debugging.md)
3. [operations/backup-recovery.md](./operations/backup-recovery.md)

## I Found An Older "Complete" Or "Phase" Doc

Do not treat it as active truth first.

1. Check [operations/DOCUMENT_AUDIT.md](./operations/DOCUMENT_AUDIT.md)
2. Confirm whether the file is classified as canonical or historical
3. Prefer code/config and the canonical docs listed in [INDEX.md](./INDEX.md)
