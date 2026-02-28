---
title: "Task Types Reference"
summary: "Current allowlisted task types in the orchestrator runtime."
---

# Task Types Reference

The canonical task allowlist lives in:

```text
workspace/orchestrator/src/taskHandlers.ts
```

This document mirrors the current allowlist at a high level. If it diverges,
the code wins.

## Current Allowlisted Task Types

### Core Runtime

- `startup`
- `doc-change`
- `doc-sync`
- `drift-repair`
- `rss-sweep`
- `nightly-batch`
- `send-digest`
- `heartbeat`

### External / Community / Content

- `reddit-response`
- `content-generate`
- `market-research`
- `data-extraction`
- `normalize-data`
- `summarize-content`

### Quality / Security / System

- `security-audit`
- `system-monitor`
- `qa-verification`
- `skill-audit`
- `integration-workflow`

### Sensitive / Approval-Gated

- `build-refactor`
- `agent-deploy`

## Approval Requirements

By default, these task types require approval before execution:

- `build-refactor`
- `agent-deploy`

The approval gate behavior is implemented in:

```text
workspace/orchestrator/src/approvalGate.ts
```

## Notes By Task Family

### Runtime Tasks

- `startup` records boot state and emits a startup milestone.
- `doc-change` and `doc-sync` manage the doc-change buffer.
- `drift-repair` can trigger doc-specialist work and emit milestone records.
- `rss-sweep`, `nightly-batch`, `send-digest`, and `heartbeat` support
  recurring operational flows.

### Worker / Agent Tasks

These route work to specialized agents or helper flows:

- `reddit-response`
- `security-audit`
- `summarize-content`
- `system-monitor`
- `content-generate`
- `integration-workflow`
- `normalize-data`
- `market-research`
- `data-extraction`
- `qa-verification`
- `skill-audit`

### Sensitive Tasks

- `build-refactor` is intentionally guarded because it can modify code and run
  tests.
- `agent-deploy` is intentionally guarded because it creates deployable agent
  surfaces.

## Where To Inspect Behavior

- `workspace/orchestrator/src/taskHandlers.ts`: handler implementations
- `workspace/orchestrator/src/middleware/validation.ts`: request schema allowlist
- `workspace/orchestrator/src/approvalGate.ts`: approval logic
- [./api.md](./api.md): API surfaces that trigger or inspect work
