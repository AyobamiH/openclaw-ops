---
title: "Documentation Index"
summary: "Authoritative map of active first-party documentation."
---

# Documentation Index

This is the authoritative file map for the first-party OpenClaw workspace docs.

If a doc is not listed here as active, do not assume it is canonical. Check the
audit register first.

Anti-drift rule:

- when code or config changes materially, update the appropriate existing
  canonical `.md` file in the same change set and reference the relevant paths
  where useful

## Canonical Navigation

| File | Purpose |
|---|---|
| [README.md](./README.md) | docs entrypoint |
| [NAVIGATION.md](./NAVIGATION.md) | role-based routes |
| [SUMMARY.md](./SUMMARY.md) | current docs status summary |
| [operations/DOCUMENT_AUDIT.md](./operations/DOCUMENT_AUDIT.md) | canonical vs historical classification |

## Runtime And Operations

| File | Purpose |
|---|---|
| [OPERATOR_GUIDE.md](./OPERATOR_GUIDE.md) | operator-facing runtime behavior |
| [GOVERNANCE_REPO_HYGIENE.md](./GOVERNANCE_REPO_HYGIENE.md) | cleanup and protection policy |
| [operations/SPRINT_TO_COMPLETION.md](./operations/SPRINT_TO_COMPLETION.md) | active closure plan |
| [operations/deployment.md](./operations/deployment.md) | production operations checklist |
| [operations/backup-recovery.md](./operations/backup-recovery.md) | recovery guidance |

## Milestone Pipeline

| File | Purpose |
|---|---|
| [CLAWDBOT_MILESTONES.md](./CLAWDBOT_MILESTONES.md) | milestone policy and evidence rules |
| [operations/MILESTONE_INGEST_CONTRACT.md](./operations/MILESTONE_INGEST_CONTRACT.md) | active ingest/feed interface contract |
| [operations/MILESTONE_PIPELINE_RUNBOOK.md](./operations/MILESTONE_PIPELINE_RUNBOOK.md) | on-call setup and troubleshooting |
| [operations/clawdbot-milestone-delivery-plan.md](./operations/clawdbot-milestone-delivery-plan.md) | implementation map and remaining work |

## Guides

| File | Purpose |
|---|---|
| [guides/configuration.md](./guides/configuration.md) | `orchestrator_config.json` and env settings |
| [guides/running-agents.md](./guides/running-agents.md) | agent execution guidance |
| [guides/monitoring.md](./guides/monitoring.md) | monitoring and health checks |
| [guides/adding-tasks.md](./guides/adding-tasks.md) | extending the task surface |

## Technical References

| File | Purpose |
|---|---|
| [concepts/architecture.md](./concepts/architecture.md) | technical system explanation |
| [reference/api.md](./reference/api.md) | API and code-facing reference |
| [reference/task-types.md](./reference/task-types.md) | task allowlist reference |
| [reference/state-schema.md](./reference/state-schema.md) | runtime state summary |
| [WEBHOOK_SIGNING_CONTRACT.md](./WEBHOOK_SIGNING_CONTRACT.md) | webhook HMAC contract |

## Start And Troubleshooting

| File | Purpose |
|---|---|
| [start/getting-started.md](./start/getting-started.md) | docs-local onboarding |
| [start/quickstart.md](./start/quickstart.md) | short checklist |
| [start/architecture-overview.md](./start/architecture-overview.md) | non-technical overview |
| [troubleshooting/common-issues.md](./troubleshooting/common-issues.md) | common fixes |
| [troubleshooting/debugging.md](./troubleshooting/debugging.md) | deeper debugging |

## Historical Or Snapshot Docs

These are not canonical, but they are still useful as historical evidence:

- [operations/DOCUMENTATION_COMPLETE.md](./operations/DOCUMENTATION_COMPLETE.md)
- [operations/IMPLEMENTATION_COMPLETE.md](./operations/IMPLEMENTATION_COMPLETE.md)
- [operations/orchestrator_documentation.md](./operations/orchestrator_documentation.md)
- [operations/orchestrator-status.md](./operations/orchestrator-status.md)
- [operations/orchestrator_workflow_plan.md](./operations/orchestrator_workflow_plan.md)
- [operations/PRD_GOVERNANCE_REMEDIATION.md](./operations/PRD_GOVERNANCE_REMEDIATION.md)

## Root Workspace Companions

- [../README.md](../README.md)
- [../QUICKSTART.md](../QUICKSTART.md)
- [../DEPLOYMENT.md](../DEPLOYMENT.md)
- [../OPENCLAW_CONTEXT_ANCHOR.md](../OPENCLAW_CONTEXT_ANCHOR.md)
