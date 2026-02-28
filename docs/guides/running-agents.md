---
title: "Running Agents"
summary: "Deploy and manage AI agents in the orchestrator."
---

# Running Agents

## Overview

Agents are specialized Node.js processes spawned by the orchestrator. Each has its own `SOUL.md`, tools, and responsibilities.

## Available Agents

### doc-specialist

Analyzes documentation changes and produces knowledge packs.

```bash
# Manual invocation (rare)
cd agents/doc-specialist
npm install
tsx src/index.ts --payload /path/to/payload.json > /path/to/result.json
```

**Triggers**:
- `doc-change` task (file modified in docs)
- `doc-sync` task (periodic refresh)
- `drift-repair` task (comprehensive audit)

**Output**:
- Knowledge pack: `logs/knowledge-packs/{timestamp}.json`
- Summary: Indexed docs, changes, recommendations

### reddit-helper

Monitors Reddit and drafts informed responses.

```bash
# Manual invocation (rare)
cd agents/reddit-helper
npm install
tsx src/index.ts --payload /path/to/payload.json > /path/to/result.json
```

**Triggers**:
- `reddit-response` task (10-minute interval)

**Input**:
- Latest knowledge pack
- Recent Reddit posts
- Context from memory

**Output**:
- Draft JSON: `logs/reddit-drafts.jsonl`
- Engagement log

---

## Task-Driven Invocation

You don't manually run agents. The orchestrator does:

```javascript
// From taskHandlers.ts
const result = spawn('tsx', [
  'src/index.ts',
  '--payload', payloadPath
], {
  cwd: agentDir,
  stdio: ['pipe', 'pipe', 'inherit']
});
```

The orchestrator:
1. Prepares a JSON payload in `/tmp`
2. Spawns the agent with `--payload /tmp/payload-123.json`
3. Collects stdout (JSON result)
4. Saves result and updates state

---

## Agent Lifecycle

```
[Task Event]
    ↓
[Orchestrator decides → Agent:X]
    ↓
[Create payload file]
    ↓
[Spawn: tsx agents/agent_x/src/index.ts --payload /tmp/payload.json]
    ↓
[Agent runs, writes result JSON to stdout]
    ↓
[Orchestrator captures stdout]
    ↓
[Clear temp files, update state]
    ↓
[Next task]
```

---

## Agent Configuration

Each agent has a `SOUL.md` describing its identity, constraints, and tools:

```bash
cat agents/doc-specialist/SOUL.md
cat agents/reddit-helper/SOUL.md
```

Update these to modify agent behavior.

---

## Manual Deployment

To deploy a new agent:

```bash
# Copy template
cp -r agents/reddit-helper agents/my-helper

# Edit SOUL.md and implement src/index.ts
nano agents/my-helper/SOUL.md
nano agents/my-helper/src/index.ts

# Register in taskHandlers.ts
# Add myHelperHandler() function and register in the handlers map

# Rebuild orchestrator
cd orchestrator && npm run build
```

---

## Monitoring Agents

Check the orchestrator state to see which agents have run:

```bash
cat logs/orchestrator.state.json | jq '.taskHistory[]' | grep -A2 '"type"'
```

Look for:
- `"status": "completed"` (success)
- `"status": "error"` (failure)
- `"result"` field (JSON output)

---

## Debugging Agent Issues

If an agent fails:

1. **Check orchestrator log**:
   ```bash
   grep "agent spawn error" logs/orchestrator.log
   ```

2. **Check temp payloads** (if not cleaned up):
   ```bash
   ls -la /tmp/orchestrator-payload-*
   cat /tmp/orchestrator-payload-* | jq
   ```

3. **Run agent manually**:
   ```bash
   cd agents/doc-specialist
   tsx src/index.ts --payload test-payload.json
   ```

4. **Check agent logs** (if it writes them):
   ```bash
   cat logs/agents/{agent_name}.log
   ```

---

See [Task Types](../reference/task-types.md) for what triggers which agents.
