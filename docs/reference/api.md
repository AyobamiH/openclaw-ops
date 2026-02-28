---
title: "API Reference"
summary: "Task handlers, types, and interfaces."
---

# API Reference

Complete reference for task handlers, types, and interfaces used in the orchestrator.

---

## Task Handler Interface

All task handlers follow this signature:

```typescript
async function taskHandler(
  state: OrchestratorState,
  config: OrchestratorConfig
): Promise<TaskResult>
```

Where:

- **`state`** (`OrchestratorState`): Current system state
- **`config`** (`OrchestratorConfig`): Loaded configuration
- **Returns**: `TaskResult` with status, result, and optional error

### Example Handler

```typescript
async function myTaskHandler(
  state: OrchestratorState,
  config: OrchestratorConfig
): Promise<TaskResult> {
  const startTime = Date.now();
  
  try {
    // Do work
    const result = {
      itemsProcessed: 42,
      success: true
    };
    
    return {
      status: 'completed',
      result,
      durationMs: Date.now() - startTime
    };
  } catch (error) {
    return {
      status: 'error',
      error: String(error),
      durationMs: Date.now() - startTime
    };
  }
}
```

---

## Core Types

### OrchestratorState

```typescript
interface OrchestratorState {
  lastStartedAt: string;              // ISO 8601
  tasksProcessed: number;             // Total count
  taskHistory: TaskRecord[];          // Last 50
  docsIndexed: string[];              // File paths
  redditResponses: RedditRecord[];    // Last 100
  rssDrafts: RSSRecord[];             // Last 200
  deployedAgents: DeploymentRecord[]; // This session
  notes?: string;                     // User notes
}
```

### TaskRecord

```typescript
interface TaskRecord {
  type: string;
  status: 'pending' | 'completed' | 'error';
  timestamp: string;                  // ISO 8601
  durationMs: number;                 // Milliseconds
  result?: any;                       // Task-specific
  error?: string;                     // Error message
}
```

### TaskResult

```typescript
interface TaskResult {
  status: 'pending' | 'completed' | 'error';
  result?: any;                       // Task-specific output
  error?: string;                     // Error message if status="error"
  durationMs?: number;                // How long took
}
```

### OrchestratorConfig

```typescript
interface OrchestratorConfig {
  docsPath: string;                   // Path to docs
  logsDir: string;                    // Where to write logs
  stateFile: string;                  // Where to persist state
  deployBaseDir?: string;             // Where agents deploy
  rssConfigPath?: string;             // RSS filter config
  redditDraftsPath?: string;          // Reddit drafts log
  knowledgePackDir?: string;          // Knowledge pack dir
  notes?: string;                     // Custom notes
}
```

### RedditRecord

```typescript
interface RedditRecord {
  timestamp: string;                  // ISO 8601
  postId: string;                     // Reddit ID
  postTitle: string;                  // Post title
  subreddit: string;                  // Subreddit name
  draftResponse: string;              // Proposed response
  confidence: number;                 // 0-1 score
  approved?: boolean;                 // Human approval
  posted?: string;                    // When posted (ISO 8601)
}
```

### RSSRecord

```typescript
interface RSSRecord {
  timestamp: string;                  // ISO 8601
  feedUrl: string;                    // Feed URL
  itemTitle: string;                  // Item title
  itemUrl: string;                    // Item link
  publishedAt: string;                // ISO 8601
  relevanceScore: number;             // 0-100
  urgency: 'high' | 'medium' | 'low';
  notes?: string;                     // Summary/reason
}
```

### DeploymentRecord

```typescript
interface DeploymentRecord {
  timestamp: string;                  // ISO 8601
  agentName: string;                  // Template name
  deployPath: string;                 // Deployment path
  metadata?: {
    version?: string;
    tags?: string[];
    config?: any;
  };
}
```

---

## Built-in Task Handlers

### startupHandler()

```typescript
async function startupHandler(
  state: OrchestratorState,
  config: OrchestratorConfig
): Promise<TaskResult>
```

**What it does**: Initialize orchestrator, load config, build doc index

**Result structure**:
```json
{
  "configLoaded": true,
  "docsIndexed": 42,
  "stateInitialized": true
}
```

**Spawns agents**: No

---

### docSyncHandler()

```typescript
async function docSyncHandler(
  state: OrchestratorState,
  config: OrchestratorConfig
): Promise<TaskResult>
```

**What it does**: Check for doc changes, regenerate knowledge pack if needed

**Result structure**:
```json
{
  "filesIndexed": 42,
  "changeDetected": true,
  "knowledgePackGenerated": true
}
```

**Spawns agents**: Yes (`doc-specialist` if changes detected)

---

### drift-repairHandler()

```typescript
async function driftRepairHandler(
  state: OrchestratorState,
  config: OrchestratorConfig
): Promise<TaskResult>
```

**What it does**: Full audit of docs, regenerate knowledge pack

**Result structure**:
```json
{
  "filesAudited": 42,
  "driftDetected": false,
  "knowledgePackRegenerated": true,
  "agentAuditResult": { ... }
}
```

**Spawns agents**: Yes (`doc-specialist`)

---

### redditResponseHandler()

```typescript
async function redditResponseHandler(
  state: OrchestratorState,
  config: OrchestratorConfig
): Promise<TaskResult>
```

**What it does**: Monitor Reddit, draft responses using knowledge pack

**Result structure**:
```json
{
  "postsEvaluated": 12,
  "draftedResponses": 3,
  "draftsLogPath": "logs/reddit-drafts.jsonl",
  "agentResult": { ... }
}
```

**Spawns agents**: Yes (`reddit-helper`)

---

### rssSweepHandler()

```typescript
async function rssSweepHandler(
  state: OrchestratorState,
  config: OrchestratorConfig
): Promise<TaskResult>
```

**What it does**: Parse RSS feeds, score/filter, generate drafts

**Result structure**:
```json
{
  "feedsParsed": 3,
  "entriesParsed": 127,
  "entriesScored": 127,
  "highPriorityItemsCount": 5,
  "draftsLogPath": "logs/rss-drafts.jsonl"
}
```

**Spawns agents**: No

---

### heartbeatHandler()

```typescript
async function heartbeatHandler(
  state: OrchestratorState,
  config: OrchestratorConfig
): Promise<TaskResult>
```

**What it does**: Health check, collect diagnostics

**Result structure**:
```json
{
  "uptime": 3600000,
  "memoryUsageMb": 127,
  "taskQueueDepth": 2,
  "healthStatus": "ok"
}
```

**Spawns agents**: No

---

### agentDeployHandler()

```typescript
async function agentDeployHandler(
  state: OrchestratorState,
  config: OrchestratorConfig
): Promise<TaskResult>
```

**What it does**: Deploy template agent to deploy directory

**Result structure**:
```json
{
  "agentName": "doc-specialist",
  "deployPath": "agents-deployed/doc-specialist-1705416768123",
  "deploymentMetadata": { ... }
}
```

**Spawns agents**: No (creates copy)

---

## Agent Spawning

When a handler needs to spawn an agent:

```typescript
import { spawn } from 'child_process';

const result = spawn('tsx', [
  'src/index.ts',
  '--payload', '/tmp/payload-123.json'
], {
  cwd: '/path/to/agent',
  stdio: ['pipe', 'pipe', 'inherit']  // ignore stdin, capture stdout, inherit stderr
});

// Collect stdout (agent output)
const chunks = [];
result.stdout.on('data', chunk => chunks.push(chunk));

// Wait for completion
result.on('close', (code) => {
  const output = Buffer.concat(chunks).toString();
  const agentResult = JSON.parse(output);
  // ... handle agentResult
});
```

The orchestrator passes task context via JSON file in `--payload` argument.

---

## Utility Functions

### State Persistence

```typescript
// Load state from file
const state = await loadState(config.stateFile);

// Save state to file
await saveState(state, config.stateFile);
```

### Documentation Indexing

```typescript
// Watch docs directory and emit changes
const indexer = new DocIndexer(config.docsPath);

indexer.on('fileChanged', (path) => {
  console.log(`Doc changed: ${path}`);
  // Trigger doc-sync or doc-change task
});

// Get current index
const docs = indexer.getIndexedDocs();
```

### Task Queue

```typescript
// Add task to queue
queue.add({
  type: 'heartbeat',
  priority: 'normal'
});

// Listen for completions
queue.on('completed', (task, result) => {
  console.log(`Task ${task.type} completed`);
});

// Listen for errors
queue.on('error', (task, error) => {
  console.error(`Task ${task.type} failed: ${error}`);
});
```

---

## Error Handling

All task handlers should wrap their work in try-catch:

```typescript
try {
  // Do work
  const result = await doSomething();
  return { status: 'completed', result };
} catch (error) {
  return {
    status: 'error',
    error: error instanceof Error ? error.message : String(error)
  };
}
```

Errors are logged and recorded in state history. The orchestrator continues running (doesn't crash).

---

## Custom Task Handler Template

```typescript
// In taskHandlers.ts

export async function myCustomHandler(
  state: OrchestratorState,
  config: OrchestratorConfig
): Promise<TaskResult> {
  const startTime = Date.now();
  
  try {
    // Validate config
    if (!config.myCustomField) {
      throw new Error('Missing myCustomField in config');
    }
    
    // Do work
    const result = {
      itemsProcessed: 0,
      successCount: 0
    };
    
    // Optional: spawn agent
    // const agentResult = await spawnAgent(...);
    // result.agentResult = agentResult;
    
    // Update state
    state.taskHistory.push({
      type: 'my-custom-task',
      status: 'completed',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      result
    });
    
    return { status: 'completed', result };
  } catch (error) {
    return {
      status: 'error',
      error: String(error),
      durationMs: Date.now() - startTime
    };
  }
}

// Register in handlers map
export const handlers: Record<string, TaskHandler> = {
  startup: startupHandler,
  'doc-sync': docSyncHandler,
  'my-custom-task': myCustomHandler,  // ← Add here
  // ... other handlers
};
```

Then add schedule in `index.ts`:

```typescript
setInterval(async () => {
  queue.add({
    type: 'my-custom-task'
  });
}, 1000 * 60 * 10); // Every 10 minutes
```

---

See [Task Types](./task-types.md) for detailed task descriptions.
