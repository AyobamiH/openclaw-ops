---
title: "Configuration"
summary: "Configure orchestrator_config.json and environment settings."
---

# Configuration

The runtime source of truth is:

- `orchestrator_config.json` at the workspace root
- agent-specific `agent.config.json` files under `agents/*/`
- environment variables used by the orchestrator process

If this guide conflicts with code or config, code and config win.

## Main Config File

The primary runtime config is:

```text
workspace/orchestrator_config.json
```

You can override that path with:

```bash
export ORCHESTRATOR_CONFIG=/path/to/alternate-config.json
```

## Core Required Fields

These fields define the minimum runtime surface:

```json
{
  "docsPath": "./openclaw-docs",
  "logsDir": "./logs",
  "stateFile": "./orchestrator_state.json"
}
```

## Common Operational Fields

These are frequently used in the current workspace:

```json
{
  "cookbookPath": "./openai-cookbook",
  "knowledgePackDir": "./logs/knowledge-packs",
  "redditDraftsPath": "./logs/reddit-drafts.jsonl",
  "rssConfigPath": "./rss_filter_config.json",
  "digestDir": "./logs/digests",
  "deployBaseDir": "./agents-deployed"
}
```

## Milestone Pipeline Fields

If you are using the milestone delivery path, these fields matter:

```json
{
  "milestoneIngestUrl": "https://<app-host>/internal/milestones/ingest",
  "milestoneFeedPath": "./orchestrator/data/milestones-feed.json",
  "gitPushOnMilestone": false
}
```

## Environment Variables

Important orchestrator runtime variables include:

```bash
API_KEY=...
WEBHOOK_SECRET=...
MONGO_USERNAME=...
MONGO_PASSWORD=...
REDIS_PASSWORD=...
ORCHESTRATOR_FAST_START=true|false
MILESTONE_SIGNING_SECRET=...
```

## Agent-Level Config

Each agent may extend the runtime surface with its own config file:

```text
workspace/agents/<agent-id>/agent.config.json
```

Those files define:

- model selection
- allowed skills
- service state paths
- orchestrator state path
- agent-specific runtime limits

## Where To Look Next

- [../reference/api.md](../reference/api.md): config-adjacent interfaces and
  runtime behavior
- [../reference/state-schema.md](../reference/state-schema.md): state file
  summary
- [../../OPENCLAW_CONTEXT_ANCHOR.md](../../OPENCLAW_CONTEXT_ANCHOR.md): current
  canonical runtime orientation
