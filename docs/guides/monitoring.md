---
title: "Monitoring & Observability"
summary: "Check system health and observe what the orchestrator is doing."
---

# Monitoring & Observability

## Live Logs

```bash
# Watch all logs
tail -f logs/orchestrator.log

# Watch specific task
grep "heartbeat" logs/orchestrator.log | tail -10

# Watch errors
grep "error\|ERROR" logs/orchestrator.log
```

---

## System State

The orchestrator persists its state to `orchestrator.state.json` after every change.

### View Current State

```bash
# Pretty-printed
cat logs/orchestrator.state.json | jq

# Specific fields
cat logs/orchestrator.state.json | jq '.lastStartedAt'
cat logs/orchestrator.state.json | jq '.taskHistory | length'
cat logs/orchestrator.state.json | jq '.taskHistory[-5:]'
```

### State Fields

| Field | Purpose |
|-------|---------|
| `lastStartedAt` | When system was last started |
| `tasksProcessed` | Total tasks completed |
| `taskHistory` | Last 50 tasks (with status, timing, results) |
| `docsIndexed` | Indexed documentation files |
| `redditResponses` | Last 100 Reddit engagement records |
| `rssDrafts` | Last 200 RSS items evaluated |
| `deployedAgents` | Agents deployed this session |

### Heartbeat Check

Heartbeats run every 5 minutes. Check if the system is alive:

```bash
# Get last heartbeat timestamp
cat logs/orchestrator.state.json | jq '.taskHistory[] | select(.type=="heartbeat")' | tail -1

# Should be recent (within last 5-10 minutes)
```

---

## Task Monitoring

### Recent Tasks

```bash
# View last 5 tasks
cat logs/orchestrator.state.json | jq '.taskHistory[-5:]'

# Filter by status
cat logs/orchestrator.state.json | jq '.taskHistory[] | select(.status=="error")'

# Filter by type
cat logs/orchestrator.state.json | jq '.taskHistory[] | select(.type=="doc-sync")'
```

### Task Structure

```json
{
  "type": "doc-sync",
  "status": "completed",
  "timestamp": "2025-01-10T14:32:48.123Z",
  "durationMs": 5234,
  "result": {
    "filesIndexed": 42,
    "changeDetected": true,
    "knowledgePackGenerated": true
  }
}
```

---

## Agent Activity

Check what agents have run:

```bash
# Agents deployed
cat logs/orchestrator.state.json | jq '.deployedAgents'

# Tasks that spawned agents
cat logs/orchestrator.state.json | jq '.taskHistory[] | select(.type=="drift-repair" or .type=="reddit-response")'
```

---

## Performance Metrics

### Average Task Duration

```bash
cat logs/orchestrator.state.json | jq '.taskHistory | map(.durationMs) | add / length'
```

### Success Rate

```bash
cat logs/orchestrator.state.json | jq '[.taskHistory[] | select(.status=="completed")] | length / .taskHistory | length * 100'
```

---

## Health Checks

Run a quick system health check:

```bash
# 1. Check process is running
ps aux | grep "node\|tsx" | grep -v grep

# 2. Check logs directory exists and has recent files
ls -la logs/ && echo "---" && find logs/ -mmin -30

# 3. Check state file is recent
stat logs/orchestrator.state.json | grep Modify

# 4. Check heartbeat is recent
cat logs/orchestrator.state.json | jq '.taskHistory[] | select(.type=="heartbeat") | .timestamp' | tail -1
```

---

## Dashboards

Create simple monitoring scripts:

```bash
#!/bin/bash
# monitor.sh

echo "=== Orchestrator Health ==="
echo "Last heartbeat:"
cat logs/orchestrator.state.json | jq '.taskHistory[] | select(.type=="heartbeat") | .timestamp' | tail -1

echo
echo "Recent errors:"
grep ERROR logs/orchestrator.log | tail -3

echo
echo "Tasks in last hour:"
cat logs/orchestrator.state.json | jq '.taskHistory | map(select(.timestamp > env.ONEHOUR_AGO)) | length'

echo
echo "Agent deployments:"
cat logs/orchestrator.state.json | jq '.deployedAgents | length'
```

---

## Alerting

Monitor for common failure patterns:

```bash
# No heartbeats in 30 minutes → system may be hung
grep heartbeat logs/orchestrator.log | tail -1

# Too many errors → check task handlers
grep error logs/orchestrator.state.json | jq 'length'

# Growing state file → may need pruning
du -h logs/orchestrator.state.json
```

See [Common Issues](../troubleshooting/common-issues.md) for what to do when something looks wrong.
