---
title: "Getting Started"
summary: "Install and run the orchestrator in 5 minutes."
read_when:
  - First time setting up
  - Deploying locally
---

# Getting Started

Get the orchestrator running locally in under 5 minutes.

## Prerequisites

- Node.js 22+ (latest LTS recommended)
- npm or yarn
- ~200MB free disk space (for docs and logs)
- One model provider API key (OpenAI, Anthropic, etc.)

## Installation

### 1. Clone or Navigate to Workspace

```bash
cd ~/.openclaw/workspace
```

### 2. Install Dependencies

```bash
cd orchestrator
npm install
```

### 3. Configure

```bash
# Copy and edit the default config
cp orchestrator_config.json orchestrator_config.json.local

# Edit paths as needed
nano orchestrator_config.json.local
```

Key settings to check:

```json
{
  "docsPath": "./openclaw-docs",
  "logsDir": "./logs",
  "stateFile": "./logs/orchestrator.state.json",
  "rssConfigPath": "./rss_filter_config.json",
  "redditDraftsPath": "./logs/reddit-drafts.jsonl"
}
```

### 4. Sync Official Docs (Optional)

```bash
./sync_openclaw_docs.sh
```

This pulls the latest OpenClaw documentation. If you skip it, the system will use whatever docs are already in `openclaw-docs/`.

### 5. Build

```bash
cd orchestrator
npm run build
```

### 6. Run

```bash
npm start
```

You should see output like:

```
[orchestrator] config loaded { docsPath: './openclaw-docs', ... }
[orchestrator] indexed 42 docs
[orchestrator] startup complete
```

## Verify It's Running

### Check Heartbeat (Every 5 Minutes)

```bash
tail -f logs/orchestrator.log | grep heartbeat
```

You should see:

```
[heartbeat] periodic
[heartbeat] periodic
...
```

### Check Task History

```bash
# Last 10 tasks
cat logs/orchestrator.state.json | jq '.taskHistory[-10:]'
```

### Check Doc Changes Are Detected

```bash
# Touch a sample doc
touch openclaw-docs/test.md

# Watch for doc-change events
tail -f logs/orchestrator.log | grep doc-change
```

## First Steps

### 1. Understand the Config

Read [Configuration](../guides/configuration.md) to learn what each setting does.

### 2. Monitor the System

Watch the logs folder to see what's happening:

```bash
ls -la logs/

# Key files to watch:
tail -f logs/orchestrator.log      # Main activity log
cat logs/orchestrator.state.json | jq  # Current state
head -20 logs/reddit-drafts.jsonl  # Latest Reddit drafts
```

### 3. Run Your First Task

Trigger a drift repair to test agent execution:

```bash
./run_drift_validation.sh
```

This will:
- Spawn the doc-specialist agent
- Process a sample document
- Generate a knowledge pack
- Save the result to logs

Check the output:

```bash
ls -la logs/knowledge-packs/
cat logs/orchestrator.state.json | jq '.driftRepairs[-1]'
```

### 4. Read the Architecture

Now that it's running, read [Architecture Overview](../start/architecture-overview.md) to understand what you're looking at.

## Troubleshooting

### "Cannot find module @types/node"

```bash
# Reinstall dependencies
cd orchestrator
rm -rf node_modules package-lock.json
npm install
```

### "ENOENT: no such file or directory 'openclaw-docs'"

```bash
# Sync docs
../sync_openclaw_docs.sh

# Or create empty directory
mkdir openclaw-docs
touch openclaw-docs/README.md
```

### "Port already in use" or "EADDRINUSE"

The orchestrator doesn't bind to a network port by default. If you see this, check for leftover Node processes:

```bash
ps aux | grep "[n]ode"
pkill -f "node.*orchestrator"
```

### "State file doesn't exist"

This is normal on first run. The system creates it automatically:

```bash
# Check if it was created
ls -la logs/orchestrator.state.json
```

## Next Steps

- **[Architecture Overview](../start/architecture-overview.md)** — Understand what's running
- **[Configuration](../guides/configuration.md)** — Customize settings
- **[Running Agents](../guides/running-agents.md)** — Deploy new agents
- **[Monitoring](../guides/monitoring.md)** — Set up continuous monitoring

## Need Help?

Check [Common Issues](../troubleshooting/common-issues.md) or review [Debugging](../troubleshooting/debugging.md).
