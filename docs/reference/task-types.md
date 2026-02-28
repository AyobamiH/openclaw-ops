---
title: "Task Types Reference"
summary: "All built-in task types, what triggers them, and what they do."
---

# Task Types Reference

The orchestrator has **8 built-in task types**. Each runs on a schedule or triggered by events.

---

## 1. `startup`

**When**: System boots

**Interval**: Once (at process start)

**Purpose**: Initialize orchestrator, load config, build doc index

**Handler**: `startupHandler()`

**Output**:
- Docs indexed
- State initialized or loaded
- Schedulers started
- Logs begin

```json
{
  "type": "startup",
  "status": "completed",
  "result": {
    "configLoaded": true,
    "docsIndexed": 42,
    "stateInitialized": true
  }
}
```

---

## 2. `doc-change`

**When**: File watcher detects doc modification

**Interval**: On-demand (triggered by file system events)

**Purpose**: Regenerate knowledge pack from changed docs

**Handler**: `docChangeHandler()`

**Spawns**: `doc-specialist` agent

**Output**:
- Knowledge pack: `logs/knowledge-packs/{timestamp}.json`
- Change delta
- Agent result

```json
{
  "type": "doc-change",
  "status": "completed",
  "result": {
    "changedFiles": ["docs/concepts/architecture.md"],
    "knowledgePackPath": "logs/knowledge-packs/1705416768123.json",
    "agentResult": { ... }
  }
}
```

---

## 3. `doc-sync`

**When**: Scheduled (triggered by interval check)

**Interval**: Every 1 minute

**Purpose**: Compare local docs vs config, detect stale docs, re-index if needed

**Handler**: `docSyncHandler()`

**Spawns**: `doc-specialist` agent (if changes detected)

**Output**:
- Files indexed
- Changes detected (boolean)
- Knowledge pack generated (if changed)

```json
{
  "type": "doc-sync",
  "status": "completed",
  "result": {
    "filesIndexed": 42,
    "changeDetected": false,
    "knowledgePackGenerated": false
  }
}
```

---

## 4. `drift-repair`

**When**: Scheduled (maintenance task)

**Interval**: Every 15 minutes

**Purpose**: Full audit of docs, regenerate knowledge pack, repair any inconsistencies

**Handler**: `driftRepairHandler()`

**Spawns**: `doc-specialist` agent

**Output**:
- Complete re-index
- Drift detection
- Full knowledge pack regeneration
- Agent audit result

```json
{
  "type": "drift-repair",
  "status": "completed",
  "result": {
    "filesAudited": 42,
    "driftDetected": false,
    "knowledgePackRegenerated": true,
    "agentAuditResult": { ... }
  }
}
```

---

## 5. `reddit-response`

**When**: Scheduled (engagement task)

**Interval**: Every 10 minutes

**Purpose**: Check Reddit for engagement opportunities, draft informed responses

**Handler**: `redditResponseHandler()`

**Spawns**: `reddit-helper` agent

**Output**:
- Drafted responses: `logs/reddit-drafts.jsonl`
- Posts evaluated
- Agent response

```json
{
  "type": "reddit-response",
  "status": "completed",
  "result": {
    "postsEvaluated": 12,
    "draftedResponses": 3,
    "draftsLogPath": "logs/reddit-drafts.jsonl",
    "agentResult": { ... }
  }
}
```

---

## 6. `rss-sweep`

**When**: Scheduled (content discovery)

**Interval**: Every 15 minutes

**Purpose**: Parse RSS feeds, score/filter entries, generate draft responses

**Handler**: `rssSweepHandler()`

**Output**:
- Feed entries parsed
- Scoring applied (relevance, recency, urgency)
- Draft summaries: `logs/rss-drafts.jsonl`
- High-priority items flagged

```json
{
  "type": "rss-sweep",
  "status": "completed",
  "result": {
    "feedsParsed": 3,
    "entriesParsed": 127,
    "entriesScored": 127,
    "highPriorityItemsCount": 5,
    "draftsLogPath": "logs/rss-drafts.jsonl"
  }
}
```

---

## 7. `heartbeat`

**When**: Scheduled (health check)

**Interval**: Every 5 minutes

**Purpose**: Confirm system is alive, collect diagnostics, emit health signals

**Handler**: `heartbeatHandler()`

**Output**:
- Process uptime
- Memory usage
- Task queue depth
- Health status

```json
{
  "type": "heartbeat",
  "status": "completed",
  "result": {
    "uptime": 3600000,
    "memoryUsageMb": 127,
    "taskQueueDepth": 2,
    "healthStatus": "ok"
  }
}
```

---

## 8. `agent-deploy`

**When**: Triggered externally or manually

**Interval**: On-demand

**Purpose**: Deploy a template agent to `agents-deployed/`

**Handler**: `agentDeployHandler()`

**Output**:
- Agent copied to deploy directory
- Deployment metadata created
- Ready for external invocation

```json
{
  "type": "agent-deploy",
  "status": "completed",
  "result": {
    "agentName": "doc-specialist",
    "deployPath": "agents-deployed/doc-specialist-1705416768123",
    "deploymentMetadata": { ... }
  }
}
```

---

## Task Scheduling

| Task | Interval | Purpose |
|------|----------|---------|
| `startup` | Once | Initialize |
| `doc-sync` | 1m | Check for doc changes |
| `heartbeat` | 5m | Health signal |
| `reddit-response` | 10m | Reddit engagement |
| `rss-sweep` | 15m | Content discovery |
| `drift-repair` | 15m | Maintenance & audit |
| `doc-change` | On-demand | React to file changes |
| `agent-deploy` | On-demand | Deploy agents |

---

## Viewing Task Queue

Check what's pending:

```bash
# View last 10 tasks
cat logs/orchestrator.state.json | jq '.taskHistory[-10:]'

# View all error tasks
cat logs/orchestrator.state.json | jq '.taskHistory[] | select(.status=="error")'
```

---

## Custom Tasks

To add a new task type:

1. Create handler in `taskHandlers.ts`
2. Register handler in the `handlers` map
3. Add schedule interval in `index.ts`
4. Update this reference doc

See [Task Handler Reference](./task-handlers.md) for implementation examples.
