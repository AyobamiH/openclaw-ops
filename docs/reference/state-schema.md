---
title: "State Schema"
summary: "Current summary of orchestrator_state.json."
---

# State Schema

The active orchestrator state file is:

```text
workspace/orchestrator_state.json
```

The canonical schema lives in:

```text
workspace/orchestrator/src/types.ts
```

This document is a current summary, not a replacement for the source type
definitions.

## Root Structure

```typescript
interface OrchestratorState {
  lastStartedAt: string | null;
  updatedAt: string | null;
  indexedDocs: number;
  docIndexVersion: number;
  pendingDocChanges: string[];
  taskHistory: TaskRecord[];
  taskExecutions: TaskExecutionRecord[];
  approvals: ApprovalRecord[];
  driftRepairs: DriftRepairRecord[];
  redditQueue: RedditQueueItem[];
  redditResponses: RedditReplyRecord[];
  agentDeployments: AgentDeploymentRecord[];
  rssDrafts: RssDraftRecord[];
  rssSeenIds: string[];
  milestoneDeliveries: MilestoneDeliveryRecord[];
  lastDriftRepairAt: string | null;
  lastRedditResponseAt: string | null;
  lastAgentDeployAt: string | null;
  lastRssSweepAt: string | null;
  lastNightlyBatch?: string | null;
  lastDigestNotificationAt?: string | null;
  lastMilestoneDeliveryAt?: string | null;
}
```

## Important Collections

| Field | Purpose |
|---|---|
| `pendingDocChanges` | buffered file paths waiting for sync/repair |
| `taskHistory` | recent task outcomes |
| `taskExecutions` | larger execution record set keyed by idempotency |
| `approvals` | pending and completed approval records |
| `driftRepairs` | drift-repair run history |
| `redditQueue` | queued community work |
| `redditResponses` | completed Reddit helper outputs |
| `agentDeployments` | deployment record history |
| `rssDrafts` | scored RSS-derived content candidates |
| `rssSeenIds` | bounded dedupe set for RSS items |
| `milestoneDeliveries` | milestone delivery lifecycle records |

## Milestone Delivery Records

Milestone delivery state is now part of the main runtime state:

```typescript
interface MilestoneDeliveryRecord {
  idempotencyKey: string;
  milestoneId: string;
  sentAtUtc: string;
  event: MilestoneEvent;
  status:
    | 'pending'
    | 'delivered'
    | 'retrying'
    | 'duplicate'
    | 'rejected'
    | 'dead-letter';
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
}
```

## Retention Behavior

Retention is enforced in code, not just documentation. The current limits are
applied in:

```text
workspace/orchestrator/src/state.ts
```

Examples of bounded collections:

- `taskHistory`
- `taskExecutions`
- `approvals`
- `driftRepairs`
- `redditResponses`
- `agentDeployments`
- `rssDrafts`
- `rssSeenIds`

If you need the exact current limits, use `state.ts` as the source of truth.

## Important Rule

If this file conflicts with:

- `orchestrator_config.json`
- `orchestrator/src/types.ts`
- `orchestrator/src/state.ts`

then the code and config win.
