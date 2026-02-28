---
title: "Configuration"
summary: "Configure orchestrator_config.json and environment settings."
---

# Configuration

## orchestrator_config.json

The main configuration file is `orchestrator_config.json` at the workspace root.

### Required Fields

```json
{
  "docsPath": "./openclaw-docs",
  "logsDir": "./logs",
  "stateFile": "./logs/orchestrator.state.json"
}
```

### Optional Fields

```json
{
  "deployBaseDir": "./agents-deployed",
  "rssConfigPath": "./rss_filter_config.json",
  "redditDraftsPath": "./logs/reddit-drafts.jsonl",
  "knowledgePackDir": "./logs/knowledge-packs",
  "notes": "Custom deployment notes"
}
```

### Environment Override

```bash
# Use a different config file
export ORCHESTRATOR_CONFIG=/path/to/config.json
npm start
```

## Field Descriptions

| Field | Purpose | Example |
|-------|---------|---------|
| `docsPath` | Path to OpenClaw docs mirror | `./openclaw-docs` or `/opt/docs` |
| `logsDir` | Where logs and artifacts go | `./logs` or `/var/log/orchestrator` |
| `stateFile` | Persistent state location | `./logs/state.json` |
| `deployBaseDir` | Where agents deploy to | `./agents-deployed` |
| `rssConfigPath` | RSS filter configuration | `./rss_filter_config.json` |
| `redditDraftsPath` | Reddit drafts JSONL | `./logs/reddit-drafts.jsonl` |
| `knowledgePackDir` | Knowledge pack artifacts | `./logs/knowledge-packs` |

---

See [Configuration Reference](../reference/configuration.md) for all options.
