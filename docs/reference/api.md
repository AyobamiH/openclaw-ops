---
title: "API Reference"
summary: "Task handlers, types, and interfaces."
---

# API Reference

Complete reference for task handlers, types, and interfaces used in the orchestrator.

## Current Operator-Facing Route Contract (Runtime Truth)

Primary private operator UI shell:

- `GET /operator` (served by orchestrator runtime)

Public monitoring/read-only:

- `GET /health`
- `GET /api/persistence/health`
- `GET /api/knowledge/summary`
- `GET /api/openapi.json`

Protected operator routes (bearer token):

- `GET /api/auth/me`
- `GET /api/dashboard/overview`
- `GET /api/tasks/catalog`
- `POST /api/tasks/trigger`
- `GET /api/tasks/runs`
- `GET /api/tasks/runs/:runId`
- `GET /api/approvals/pending`
- `POST /api/approvals/:id/decision`
- `GET /api/incidents`
- `GET /api/incidents/:id`
- `GET /api/incidents/:id/history`
- `POST /api/incidents/:id/acknowledge`
- `POST /api/incidents/:id/owner`
- `POST /api/incidents/:id/remediate`
- `GET /api/agents/overview`
- `GET /api/skills/registry`
- `GET /api/skills/policy`
- `GET /api/skills/telemetry`
- `GET /api/skills/audit`
- `GET /api/memory/recall`
- `GET /api/health/extended`
- `POST /api/knowledge/query`
- `GET /api/knowledge/export`
- `GET /api/persistence/historical`
- `GET /api/persistence/summary`
- `GET /api/persistence/export`

Internal ingest:

- `POST /webhook/alerts` (HMAC signature required)

Boundary reminder:

- `openclawdbot` remains a separate Reddit/Devvit proof/community surface and
  should not be treated as the primary private operator UI.

Mission Control implementation note:

- the larger Mission Control blueprint remains future operator-console work
  only
- this phase adds persistent incidents, incident history/remediation routes,
  deeper workflow graphs, knowledge graphs, topology relationship edges, and
  agent capability readiness inside the existing console rails
- the canonical agent maturity target for these surfaces now lives in
  `docs/architecture/AGENT_CAPABILITY_MODEL.md`
- it does **not** adopt a new global shell, Three.js background, or starfield
  environment yet

Operator Station contract truth:

- `GET /api/health/extended`: authoritative protected operator-health surface.
- `GET /api/dashboard/overview`: protected operator aggregation only. Useful
  for queue, approvals, governance, and recent-task visibility, but not
  authoritative system health.
- `GET /health`: shallow public liveness only. It currently returns internal
  `localhost` helper URLs and those values must not be treated as browser
  targets by external frontends.
- `GET /api/auth/me`: protected auth identity surface.
- `GET /api/persistence/health`: public persistence dependency truth only.
- `/system-health`: not a backend route; it is a frontend-only page path.

### Operator Station Rendering Guardrails

Do not render these nested objects directly:

- `/api/health/extended.controlPlane`
- `/api/health/extended.controlPlane.queue`
- `/api/health/extended.workers`
- `/api/health/extended.repairs`
- `/api/health/extended.dependencies`
- `/api/health/extended.dependencies.persistence`
- `/api/health/extended.dependencies.knowledge`
- `/api/dashboard/overview.health`
- `/api/dashboard/overview.persistence`
- `/api/dashboard/overview.memory`
- `/api/dashboard/overview.queue`
- `/api/dashboard/overview.approvals`
- `/api/dashboard/overview.selfHealing`
- `/api/dashboard/overview.governance`
- `/api/dashboard/overview.truthLayers`
- `/api/dashboard/overview.proofDelivery`
- `/api/dashboard/overview.topology`
- `/api/dashboard/overview.incidents`
- `/api/dashboard/overview.recentTasks`
- `/api/health/extended.truthLayers`
- `/api/health/extended.proofDelivery`
- `/api/health/extended.topology`
- `/api/health/extended.incidents`
- `/api/agents/overview.topology`

Safe leaf fields to render:

- `/api/auth/me`: `actor`, `role`, `apiKeyLabel`, `apiKeyExpiresAt`
- `/api/health/extended`: `status`, `controlPlane.routing`,
  `controlPlane.queue.queued`, `controlPlane.queue.processing`,
  `workers.declaredAgents`, `workers.spawnedWorkerCapableCount`,
  `workers.serviceAvailableCount`, `workers.serviceInstalledCount`,
  `workers.serviceRunningCount`,
  `workers.serviceOperationalCount` (legacy compatibility alias),
  `repairs.activeCount`,
  `repairs.verifiedCount`, `repairs.failedCount`,
  `dependencies.persistence.status`,
  `dependencies.persistence.database`, `dependencies.persistence.collections`,
  `dependencies.knowledge.indexedEntries`,
  `dependencies.knowledge.conceptCount`,
  `truthLayers.configured.status`,
  `truthLayers.configured.summary`,
  `truthLayers.observed.status`,
  `truthLayers.observed.summary`,
  `truthLayers.public.status`,
  `truthLayers.public.summary`,
  `proofDelivery.milestone.deliveryStatus`,
  `proofDelivery.demandSummary.deliveryStatus`,
  `topology.status`,
  `topology.counts.totalNodes`,
  `topology.counts.totalEdges`,
  `topology.counts.relationshipEdges`,
  `topology.relationshipHistory.totalObservations`,
  `topology.relationshipHistory.lastObservedAt`,
  `topology.relationshipHistory.windows.short.totalObservations`,
  `topology.relationshipHistory.windows.long.totalObservations`,
  `topology.relationshipHistory.graph.totalNodes`,
  `topology.relationshipHistory.graph.totalEdges`,
  `topology.hotspots[]`,
  `incidents.overallStatus`,
  `incidents.openCount`,
  `incidents.activeCount`,
  `incidents.bySeverity.critical`,
  `incidents.bySeverity.warning`,
  `incidents.bySeverity.info`
- `/api/dashboard/overview`: `health.fastStartMode`, `queue.queued`,
  `queue.processing`, `approvals.pendingCount`,
  `selfHealing.summary.totalCount`, `selfHealing.summary.activeCount`,
  `selfHealing.summary.verifiedCount`, governance count fields,
  `truthLayers.claimed.publicProofBoundary`,
  `truthLayers.claimed.summary`,
  `truthLayers.configured.status`,
  `truthLayers.configured.summary`,
  `truthLayers.configured.evidence[].label`,
  `truthLayers.configured.evidence[].status`,
  `truthLayers.configured.signals[].severity`,
  `truthLayers.configured.signals[].message`,
  `truthLayers.configured.proofTransportsConfigured`,
  `truthLayers.observed.status`,
  `truthLayers.observed.summary`,
  `truthLayers.observed.evidence[].label`,
  `truthLayers.observed.evidence[].status`,
  `truthLayers.observed.signals[].severity`,
  `truthLayers.observed.signals[].message`,
  `truthLayers.observed.recentTasks.count`,
  `truthLayers.observed.lastMilestoneDeliveryAt`,
  `truthLayers.observed.lastDemandSummaryDeliveryAt`,
  `truthLayers.public.status`,
  `truthLayers.public.summary`,
  `truthLayers.public.evidence[].label`,
  `truthLayers.public.evidence[].status`,
  `truthLayers.public.signals[].severity`,
  `truthLayers.public.signals[].message`,
  `truthLayers.public.milestoneStatus`,
  `truthLayers.public.demandSummaryStatus`,
  `proofDelivery.boundary.surface`,
  `proofDelivery.signingSecretConfigured`,
  `proofDelivery.milestone.deliveryStatus`,
  `proofDelivery.milestone.targetConfigured`,
  `proofDelivery.milestone.targetReady`,
  `proofDelivery.milestone.feedConfigured`,
  `proofDelivery.milestone.gitPushEnabled`,
  `proofDelivery.milestone.ledger.pendingCount`,
  `proofDelivery.milestone.ledger.retryingCount`,
  `proofDelivery.milestone.ledger.deadLetterCount`,
  `proofDelivery.milestone.ledger.deliveredCount`,
  `proofDelivery.demandSummary.deliveryStatus`,
  `proofDelivery.demandSummary.targetConfigured`,
  `proofDelivery.demandSummary.targetReady`,
  `proofDelivery.demandSummary.ledger.pendingCount`,
  `proofDelivery.demandSummary.ledger.retryingCount`,
  `proofDelivery.demandSummary.ledger.deadLetterCount`,
  `proofDelivery.demandSummary.ledger.deliveredCount`,
  `topology.status`,
  `topology.counts.totalNodes`,
  `topology.counts.totalEdges`,
  `topology.counts.routeEdges`,
  `topology.counts.skillEdges`,
  `topology.counts.proofEdges`,
  `topology.relationshipHistory.totalObservations`,
  `topology.relationshipHistory.lastObservedAt`,
  `topology.relationshipHistory.windows.short.totalObservations`,
  `topology.relationshipHistory.windows.long.totalObservations`,
  `topology.relationshipHistory.graph.totalNodes`,
  `topology.relationshipHistory.graph.totalEdges`,
  `topology.hotspots[]`,
  `incidents.overallStatus`,
  `incidents.openCount`,
  `incidents.activeCount`,
  `incidents.watchingCount`,
  `incidents.bySeverity.critical`,
  `incidents.bySeverity.warning`,
  `incidents.bySeverity.info`,
  `incidents.incidents[].title`,
  `incidents.incidents[].severity`,
  `incidents.incidents[].status`,
  `incidents.incidents[].truthLayer`,
  `incidents.incidents[].summary`,
  `incidents.incidents[].firstSeenAt`,
  `incidents.incidents[].lastSeenAt`,
  `incidents.incidents[].acknowledgedAt`,
  `incidents.incidents[].acknowledgedBy`,
  `incidents.incidents[].owner`,
  `incidents.incidents[].affectedSurfaces[]`,
  `incidents.incidents[].linkedServiceIds[]`,
  `incidents.incidents[].linkedTaskIds[]`,
  `incidents.incidents[].linkedRunIds[]`,
  `incidents.incidents[].linkedRepairIds[]`,
  `incidents.incidents[].linkedProofDeliveries[]`,
  `incidents.incidents[].recommendedSteps[]`,
  `incidents.incidents[].policy.policyId`,
  `incidents.incidents[].policy.remediationTaskType`,
  `incidents.incidents[].policy.verifierTaskType`,
  `incidents.incidents[].policy.targetSlaMinutes`,
  `incidents.incidents[].escalation.level`,
  `incidents.incidents[].escalation.summary`,
  `incidents.incidents[].escalation.dueAt`,
  `incidents.incidents[].verification.required`,
  `incidents.incidents[].verification.status`,
  `incidents.incidents[].verification.summary`,
  `incidents.incidents[].remediation.status`,
  `incidents.incidents[].remediation.owner`,
  `incidents.incidents[].remediation.nextAction`,
  `incidents.incidents[].remediation.blockers[]`,
  `incidents.incidents[].remediationPlan[]`,
  `recentTasks[].handledAt`, `recentTasks[].type`, `recentTasks[].result`,
  `recentTasks[].message`
  Approval payloads can now include review-gated Reddit lead promotions:
  `manual-review` leads require explicit approval, and the top `10` `draft`
  leads can be optionally promoted into `reddit-response` through the same
  replay surface.
- `/api/tasks/runs` and `/api/tasks/runs/:runId`: `repair.repairId`,
  `repair.classification`, `repair.status`, `repair.verificationMode`,
  `repair.verificationSummary`, `workflow.stage`, `workflow.graphStatus`,
  `workflow.currentStage`, `workflow.blockedStage`, `workflow.stopReason`,
  `workflow.stopClassification`,
  `workflow.awaitingApproval`, `workflow.retryScheduled`,
  `workflow.nextRetryAt`, `workflow.repairStatus`, `workflow.eventCount`,
  `workflow.stageDurations`, `workflow.timingBreakdown`,
  `workflow.nodeCount`, `workflow.edgeCount`,
  `workflowGraph.causalLinks[]`,
  `approval.required`, `approval.status`, `approval.requestedAt`,
  `approval.decidedAt`, `events[]`, `proofLinks[]`, and
  `workflowGraph.{nodes,edges,events,proofLinks,stopClassification,timingBreakdown}`
  when present
- `/api/incidents` and `/api/incidents/:id`: stable incident IDs,
  first/last-seen timestamps, acknowledgement state, owner,
  `history[]`, `acknowledgements[]`, `ownershipHistory[]`,
  `remediationTasks[]`, linked service/task/run/proof references, and
  current remediation guidance, policy, escalation, verification, and
  remediation plan state
- `/api/incidents/:id/history`: isolated incident history stream with
  `history[]`, `acknowledgements[]`, `ownershipHistory[]`, and remediation
  task lifecycle records including assignment/execution/verification/resolution
- `/api/knowledge/summary` and `/api/knowledge/query`: provenance,
  contradiction, and freshness graphs plus `runtime.repairLoop` /
  `meta.repairLoop` for knowledge-repair posture
- `/api/agents/overview`: relationship history windows, observed relationship
  graph, target capability set, and evidence profiles showing how close an
  agent is to the capability target
  timestamps
- `/api/approvals/pending`: `impact.riskLevel`, `impact.approvalReason`,
  `impact.dependencyClass`, `impact.affectedSurfaces`,
  `impact.dependencyRequirements`, `impact.caveats`,
  `payloadPreview.keyCount`, `payloadPreview.keys`,
  `payloadPreview.internalKeyCount`
- `/api/knowledge/summary`: `diagnostics.freshness`,
  `diagnostics.provenance`, `diagnostics.contradictionSignals`,
  `diagnostics.graphs.{provenance,contradictions,freshness}`,
  `runtime.index`, `runtime.coverage`, `runtime.freshness`,
  `runtime.signals.coverage`, `runtime.signals.staleness`,
  `runtime.signals.contradictions`,
  `runtime.graphs.{provenance,contradictions,freshness}`
- `/api/knowledge/query`: top-level `meta` (query-scoped freshness,
  provenance, contradiction signals, and knowledge graphs) and `runtime`
  (repo/runtime knowledge signals and knowledge graphs)
- `/api/agents/overview`: `modelTier`, `allowedSkills[]`,
  `capability.role`, `capability.spine`, `capability.currentReadiness`,
  `capability.targetCapabilities[]`, `capability.evidence[]`,
  `capability.presentCapabilities[]`, `capability.missingCapabilities[]`,
  `capability.evidenceProfiles[]`, `capability.ultraGapSummary`,
  `topology.edges[].relationship`,
  `relationshipHistory.totalObservations`,
  `relationshipHistory.lastObservedAt`,
  `relationshipHistory.byRelationship`,
  `relationshipHistory.byStatus`,
  `relationshipHistory.timeline[]`,
  `relationshipHistory.recent[]`
- `/health`: `status`, `timestamp`

Auth persistence requirement:

- External Operator Station frontends must persist the bearer token across
  preview/auth-bridge redirects. In-memory-only token state is not reliable for
  protected fetch flows when the hosting shell can redirect before protected
  route calls complete.

Operational worker-proof workflow used in the `2026-03-07` spawned-worker sweep:

- `POST /api/tasks/trigger`
- `GET /api/tasks/runs` or `GET /api/tasks/runs/:runId`
- `GET /api/skills/audit` (ToolGate preflight / execute evidence where present)
- `GET /api/memory/recall?agentId=...`

Interpretation note from the `2026-03-07` repair follow-up:

- `GET /api/dashboard/overview.selfHealing` and
  `GET /api/health/extended.repairs` now expose bounded repair evidence for the
  live `doc-drift -> drift-repair -> knowledge-pack verification` loop.
- `GET /api/tasks/runs` and `GET /api/tasks/runs/:runId` now include `repair`
  metadata when a task run belongs to a tracked repair attempt.
- `GET /api/tasks/runs` and `GET /api/tasks/runs/:runId` now also expose
  `workflow`, `approval`, and ordered `events[]` so frontends can render run
  replay state from real queue/approval/retry/repair evidence instead of
  inventing it client-side.
- `GET /api/tasks/runs` and `GET /api/tasks/runs/:runId` now also expose
  `proofLinks[]` and canonical `workflowGraph` payloads so the operator console
  can show where execution stopped across ingress, queue, approval, agent,
  result, and proof delivery.
- `GET /api/approvals/pending` now includes `impact` and `payloadPreview`
  metadata so approval review UIs can surface risk, affected surfaces, and
  replay semantics without reconstructing those fields on the client.
- `GET /api/agents/overview` now exposes `serviceAvailable` separately from
  `serviceInstalled` and `serviceRunning`. The older
  `serviceImplementation` and `serviceOperational` fields remain compatibility
  aliases and should not be treated as stronger truth than the explicit split
  fields. `serviceRunning=false` is valid host truth when the unit is absent or
  inactive; `null` is reserved for probe-unavailable cases. Per-agent host
  hints now also include `serviceUnitState`, `serviceUnitSubState`, and
  `serviceUnitFileState`.
- `POST /api/incidents/:id/acknowledge` and `POST /api/incidents/:id/owner`
  now mutate the persistent incident ledger. Incident payloads returned by
  overview and extended health retain stable IDs, first/last seen timestamps,
  acknowledgement state, owner, linked service/task/run/proof references, and
  remediation steps.
- `GET /api/incidents` and `GET /api/incidents/:id` now expose incident list and
  detail/history views from the persistent ledger, including acknowledgement
  history, explicit ownership lifecycle history, and linked remediation task
  records.
- `GET /api/incidents/:id/history` now provides the incident lifecycle stream as
  a dedicated route so operators can inspect acknowledgement, ownership, and
  remediation progression without re-fetching the full incident detail object.
- `POST /api/incidents/:id/remediate` now creates a linked remediation task
  using an allowlisted remediation mapping (`drift-repair`, `qa-verification`,
  or `system-monitor`) and persists that linkage back into the incident ledger.
- `GET /api/agents/overview` now also exposes capability readiness derived from
  real runtime evidence. It distinguishes declared/foundation/operational/
  advanced readiness and reports remaining capability gaps instead of labeling
  agents “ultra” prematurely.
  `serviceUnitFileState`.
- `GET /api/agents/overview` now also exposes `topology`, a derived graph of
  `orchestrator -> task -> agent -> skill` relationships plus the separate
  `orchestrator -> openclawdbot` proof edge and bounded
  `agent -> agent` relationship edges (`feeds-agent`, `verifies-agent`,
  `monitors-agent`, `audits-agent`, `coordinates-agent`). This is derived from
  manifests, task/skill contracts, declared ultra-agent roles, and current
  runtime evidence.
- `GET /api/agents/overview` now also exposes `relationshipHistory`, a bounded
  history view of observed delegation, tool-use, verification, monitoring, and
  proof-delivery edges over time. `topology` remains the current graph shape;
  `relationshipHistory` preserves the underlying observed events and their
  hourly aggregation window for operator replay.
- `GET /api/dashboard/overview` and `GET /api/health/extended` now expose
  `truthLayers` and `proofDelivery` so frontends can distinguish declared
  control-plane intent, current runtime configuration, observed operator state,
  and the separate public-proof delivery boundary without inventing those
  distinctions client-side.
- `GET /api/dashboard/overview` and `GET /api/health/extended` now also expose
  `incidents`, a derived incident/remediation model built from persistence,
  proof delivery, repairs, retry recovery, agent service gaps, approval backlog,
  and knowledge freshness/contradiction signals. These are runtime evidence
  summaries, not ticket-system records.
- `GET /api/knowledge/summary` and `POST /api/knowledge/query` now expose
  knowledge freshness, provenance, contradiction signals, and runtime
  coverage/staleness signals. They now also expose first-class provenance,
  contradiction, and freshness graphs so consumers can reason over topology and
  drift rather than just scalar signals. These are deterministic diagnostics
  based on the current knowledge base and indexed doc/runtime state; they are
  not speculative AI summaries.

The route contract above is authoritative for Operator Station integration.
Generic handler/type sketches lower in this file are legacy orientation only;
runtime code wins if those examples diverge.

## CORS Contract (Direct Frontend Integration)

- CORS policy is backend-owned and deny-by-default.
- Cross-origin requests from origins not on the allowlist are rejected (`403`).
- No wildcard origin (`*`) policy is used.
- Required header for protected routes:
  `Authorization: Bearer <token>`.
- Default preflight-allowed methods: `GET, POST` (+ `OPTIONS` handling).
- Default preflight-allowed request headers:
  `Authorization, Content-Type`.
- Default exposed response headers:
  `X-Request-Id, X-API-Key-Expires, ratelimit-limit, ratelimit-remaining, ratelimit-reset, Retry-After`.
- Credentials are disabled by default (`corsAllowCredentials=false`) unless
  explicitly enabled.

Configuration keys (JSON config or env override):

- `corsAllowedOrigins` / `ORCHESTRATOR_CORS_ALLOWED_ORIGINS`
- `corsAllowedMethods` / `ORCHESTRATOR_CORS_ALLOWED_METHODS`
- `corsAllowedHeaders` / `ORCHESTRATOR_CORS_ALLOWED_HEADERS`
- `corsExposedHeaders` / `ORCHESTRATOR_CORS_EXPOSED_HEADERS`
- `corsAllowCredentials` / `ORCHESTRATOR_CORS_ALLOW_CREDENTIALS`
- `corsMaxAgeSeconds` / `ORCHESTRATOR_CORS_MAX_AGE_SECONDS`

## Response Cache Contract

The orchestrator now uses a bounded response cache for repeated read-heavy API
surfaces.

Runtime truth:

- If `REDIS_URL` is reachable, cached responses are stored in Redis.
- If Redis is unavailable or not configured, the orchestrator falls back to a
  bounded in-memory cache instead of failing startup.
- Cache invalidation is tag-based and tied to orchestrator runtime state
  writes. Knowledge surfaces are invalidated separately from broader runtime
  state.

Operator-visible headers:

- `X-OpenClaw-Cache: hit|miss`
- `X-OpenClaw-Cache-Store: redis|memory`
- `Cache-Control: public|max-age=*` for public cached reads
- `Cache-Control: private|max-age=*` plus `Vary: Authorization` for protected
  cached reads

Current cached read surfaces:

- Public:
  - `GET /api/knowledge/summary`
  - `GET /api/openapi.json`
  - `GET /api/persistence/health`
- Protected:
  - `GET /api/tasks/catalog`
  - `GET /api/approvals/pending`
  - `GET /api/incidents`
  - `GET /api/incidents/:id`
  - `GET /api/incidents/:id/history`
  - `GET /api/dashboard/overview`
  - `GET /api/agents/overview`
  - `GET /api/memory/recall`
  - `POST /api/knowledge/query`
  - `GET /api/tasks/runs`
  - `GET /api/tasks/runs/:runId`
  - `GET /api/skills/registry`
  - `GET /api/skills/policy`
  - `GET /api/skills/telemetry`
  - `GET /api/skills/audit`
  - `GET /api/health/extended`
  - `GET /api/persistence/summary`

The response cache is intended to reduce repeated operator-console fetch cost
for identical route/query/body/auth combinations over short windows. It is not
a claim of browser-side offline caching or immutable API payloads.

## Rate Limits And 429 Handling

Current runtime limiter policy:

- Public monitoring endpoints:
  - `/health`: `1000 requests / 60s / IP`
  - `/api/persistence/health`: `1000 requests / 60s / IP`
- Public read endpoints:
  - `/api/knowledge/summary`, `/api/openapi.json`:
    `30 requests / 60s / IP`
- Protected endpoints:
  - pre-auth abuse guard: `300 requests / 60s / IP`
  - bucket A (`viewer-read`): `120 requests / 60s` per authenticated actor/key
    label for protected read routes (`GET` visibility endpoints including
    `/api/skills/audit`, `/api/health/extended`, `/api/persistence/summary`)
  - bucket B (`operator-write`): `30 requests / 60s` per authenticated
    actor/key label for protected write routes
    (`POST /api/tasks/trigger`, `POST /api/approvals/:id/decision`,
    `POST /api/knowledge/query`)
  - bucket C (`admin-export`): `10 requests / 60s` per authenticated
    actor/key label for admin export routes
    (`GET /api/knowledge/export`, `GET /api/persistence/export`)
  - authenticated bucket key precedence:
    `req.auth.actor` -> `req.auth.apiKeyLabel[:version]` -> IP fallback

Client contract:

- Treat `429` as expected flow-control, not a fatal API outage.
- On `429`, respect `Retry-After` first.
- If `Retry-After` is absent, use `ratelimit-reset` as the minimum wait.
- Normal operator-console polling is supported by bucket A, but avoid
  synchronized parallel bursts; stagger polling intervals with jitter.

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
