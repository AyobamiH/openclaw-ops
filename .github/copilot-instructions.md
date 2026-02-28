# Copilot Instructions

## What This Repo Is

**OpenClaw** is an orchestrated multi-agent AI runtime. `workspace/` is the active runtime root. All services, configs, agents, and docs live under `workspace/`. The `.openclaw/` root is the OpenClaw daemon data directory (credentials, memory index, telegram config, etc.) and is **not** the application source.

The system has three major surfaces:
1. **Orchestrator** (`workspace/orchestrator/`) — Node.js control plane: HTTP API, task queue, doc indexer, state manager, cron, metrics, persistence.
2. **Agent Services** (`workspace/agents/`) — Specialized workers spawned or run as persistent services.
3. **openclawdbot** (`workspace/openclawdbot/`) — Reddit Devvit app (React 19 + Hono + tRPC) that displays milestone events on Reddit.com.

---

## Build, Test, and Lint Commands

### Orchestrator (`workspace/orchestrator/`)

```bash
cd workspace/orchestrator

npm install                                   # install dependencies
npm run build                                 # tsc → dist/
npm run dev                                   # tsx src/index.ts (no build needed)
npm run start                                 # node dist/index.js (production)

# Testing
npm run test:run                              # all tests (vitest run)
npm run test:unit:fixtures                    # unit fixture tests only
npm run test:integration                      # integration tests only (spins up real server)
npm run test:coverage                         # coverage (min thresholds: lines 85%, branches 80%)

# Run a single test file
npx vitest run test/gap7-key-rotation.test.ts --reporter=verbose
npx vitest run test/integration/toolgate-permissions.test.ts --reporter=verbose

# Type-check only (no emit)
npx tsc --noEmit

# Doc drift contract (also runs in CI)
bash scripts/check-doc-drift.sh

# Doc sync check (staged or all)
node scripts/check-doc-sync.mjs
node scripts/check-doc-sync.mjs --staged

# Live load tests (requires running server)
npm run test:live:quick    # 120 tasks, 50ms interval, 80 IPs
npm run test:live:3000     # 3000 tasks, 25ms interval, 400 IPs
```

### openclawdbot (`workspace/openclawdbot/`)

```bash
cd workspace/openclawdbot
npm run type-check       # tsc --build
npm run lint             # eslint src/**/*.{ts,tsx}
npm run test             # vitest run
npm run test -- my-file  # single file
npm run dev              # devvit playtest (Reddit sandbox)
npm run build            # vite build
npm run deploy           # type-check + lint + test + devvit upload
npm run launch           # deploy + devvit publish
```

### Root workspace

```bash
cd workspace
npm install                                  # root deps (tsx only)
bash sync_docs_sources.sh                    # sync openclaw-docs + openai-cookbook mirrors
bash run_drift_validation.sh                 # manual drift repair validation via compiled dist
bash scripts/audit_context_anchor_recon.sh   # recon + writes report to logs/audits/context-anchor/
bash scripts/check-doc-drift.sh              # same check CI runs
```

### CI Pipeline (`.github/workflows/test.yml`)

Triggers on push/PR to `main`, `master`, `develop`. Runs: root `npm install` → `cd orchestrator && npm install` → `npm run build` → `bash scripts/check-doc-drift.sh` → `npm run test:unit:fixtures` → `npm run test:integration` → `npx tsc --noEmit`.

### Docker

```bash
# Root stack (orchestrator only)
docker-compose up                            # builds from workspace/orchestrator/Dockerfile

# Full orchestrator stack (Mongo + Redis + Prometheus + Grafana + AlertManager)
cd orchestrator && docker-compose up
```

---

## Architecture

### Orchestrator Startup Sequence (`src/index.ts`)

1. **Security posture check** — verifies required env vars (`API_KEY`, `WEBHOOK_SECRET`, `MONGO_PASSWORD`, `REDIS_PASSWORD`, `MONGO_USERNAME`) + key rotation policy. Startup fails hard if any are missing.
2. **Load config** — `loadConfig()` reads `orchestrator_config.json` (or `$ORCHESTRATOR_CONFIG` env var override).
3. **Mkdir** — ensures `logsDir` and `stateFile` parent dir exist.
4. **Load state** — `loadState(config.stateFile)` from `orchestrator_state.json`. On parse failure, starts with default state (degraded mode unless `strictPersistence: true`).
5. **DocIndexer** — builds initial index of `docsPath` (and `cookbookPath` if configured). Sets up chokidar watcher that enqueues `doc-change` tasks on file changes.
6. **AgentRegistry** — discovers all agents from `workspace/agents/*/agent.config.json`. Skips `AGENT_TEMPLATE` and dotfiles.
7. **ToolGate** — initializes singleton permission enforcement layer.
8. **TaskQueue** — `PQueue` with `concurrency: 2`. Validates task type against `ALLOWED_TASK_TYPES` allowlist at enqueue time.
9. **AlertManager** — configures alert routing (Slack/email).
10. **MemoryScheduler** — hourly snapshots, daily consolidation at 1 AM (skipped if `ORCHESTRATOR_FAST_START=true`).
11. **KnowledgeIntegration** — initializes KB from MongoDB if available; hooks into daily consolidation.
12. **PersistenceIntegration** — connects to MongoDB. Non-fatal if unavailable.
13. **Cron** — three jobs: nightly-batch (default `0 23 * * *`), send-digest (default `0 6 * * *`), heartbeat (every 5 min).
14. **Express API** — listens on `PORT` (default `3000`).
15. **Metrics server** — Prometheus on port `9100` at `/metrics`.
16. **SIGTERM/SIGINT** — graceful shutdown: stop queue, flush state, stop schedulers, close HTTP server.

**Fast-start mode:** `ORCHESTRATOR_FAST_START=true` skips DocIndexer watch setup, MemoryScheduler startup, KnowledgeIntegration, PersistenceIntegration, and cron registration. Used by integration tests.

### Task System

**Task types** (complete `ALLOWED_TASK_TYPES` allowlist — adding a new type requires updating this const in `taskHandlers.ts` AND `TaskTriggerSchema` in `middleware/validation.ts`):

| Task Type | Handler Agent |
|---|---|
| `startup` | internal |
| `doc-change` | internal → doc-specialist |
| `doc-sync` | internal |
| `drift-repair` | doc-specialist (spawned via `tsx src/index.ts`) |
| `reddit-response` | reddit-helper (spawned) |
| `security-audit` | security-agent |
| `summarize-content` | summarization-agent |
| `system-monitor` | system-monitor-agent |
| `build-refactor` | build-refactor-agent (**approval required**) |
| `content-generate` | content-agent |
| `integration-workflow` | integration-agent |
| `normalize-data` | normalization-agent |
| `market-research` | market-research-agent |
| `data-extraction` | data-extraction-agent |
| `qa-verification` | qa-verification-agent |
| `skill-audit` | skill-audit-agent |
| `rss-sweep` | internal |
| `nightly-batch` | internal (triggers rss-sweep + other jobs) |
| `send-digest` | internal (notifier → Slack/Discord/email) |
| `heartbeat` | internal |
| `agent-deploy` | internal (**approval required**) |

**Idempotency:** `TaskQueue.enqueue()` auto-derives an idempotency key: if `payload.idempotencyKey` is provided, it is used; otherwise SHA-256 of `type:JSON.stringify(payload)` with prefix `auto-`. Execution records in `state.taskExecutions` track per-key status.

**Retry logic:** Default `retryMaxAttempts: 2`, `retryBackoffMs: 500` (configurable in `orchestrator_config.json`). On failure, re-enqueues with `__attempt` counter incremented.

**Approval gate** (`src/approvalGate.ts`): Tasks of types `agent-deploy` and `build-refactor` (configurable via `approvalRequiredTaskTypes` in config) halt and record a `pending` approval record. Approval is granted via `POST /api/approvals/:id/decision`. On approval, the task is re-enqueued with `approvedFromTaskId` set, which bypasses the gate for that replay.

**Tool gate** (`src/toolGate.ts`): Singleton. Enforces per-agent skill allowlist (from `agent.config.json` `permissions.skills`). Every invocation is logged. Denied invocations are counted. Accessible via `/api/toolgate/log` (internal).

### HTTP API (`src/index.ts`, default port `3000`)

**Public (no auth):**
| Endpoint | Description |
|---|---|
| `GET /health` | Status + links to metrics/KB/persistence |
| `GET /api/knowledge/summary` | KB stats (entry count, concept count) |
| `GET /api/openapi.json` | OpenAPI spec |
| `GET /api/persistence/health` | MongoDB health |

**Protected (Bearer token via `Authorization: Bearer <API_KEY>`):**
| Endpoint | Rate limiter | Description |
|---|---|---|
| `POST /api/tasks/trigger` | apiLimiter + authLimiter | Enqueue any allowed task type |
| `GET /api/approvals/pending` | apiLimiter + authLimiter | List pending approvals |
| `POST /api/approvals/:id/decision` | apiLimiter + authLimiter | Approve or reject; auto-replays on approval |
| `GET /api/dashboard/overview` | apiLimiter + authLimiter | Health, queue depth, recent tasks, pending approvals, memory summary |
| `GET /api/memory/recall` | apiLimiter + authLimiter | Paginated agent memory states (`?limit`, `?offset`, `?agentId`, `?includeSensitive`, `?includeErrors`) |
| `POST /api/knowledge/query` | apiLimiter + authLimiter | Query knowledge base (`{query, limit?, filter?}`) |
| `GET /api/knowledge/export` | exportLimiter + authLimiter | Export KB as `?format=markdown\|json` |
| `GET /api/persistence/historical` | apiLimiter + authLimiter | MongoDB historical data (`?days`, `?metric`, `?aggregation`) |
| `GET /api/persistence/export` | exportLimiter + authLimiter | Full persistence export |

**Webhook (HMAC signature via `X-Webhook-Signature`):**
| Endpoint | Description |
|---|---|
| `POST /webhook/alerts` | AlertManager webhook → routes to Slack + SendGrid |

**Rate limits:**
- `webhookLimiter`: 100 req/min
- `apiLimiter`: 30 req/min per IP
- `exportLimiter`: 5 req/min per IP (expensive ops)
- `authLimiter`: 10 req/min per IP (brute-force protection, counts all requests including success)
- `healthLimiter`: 1000 req/min (monitoring-friendly)

Request body and query params are validated with Zod schemas in `src/middleware/validation.ts`. Max payload: 1 MB.

### State Schema (`src/types.ts` + `src/state.ts`)

`orchestrator_state.json` is the single runtime state file for orchestrator + all agents. Key retention limits (constants in `state.ts`):

| Collection | Limit |
|---|---|
| `taskHistory` | 50 (configurable via `taskHistoryLimit` in config) |
| `taskExecutions` | 5000 |
| `approvals` | 1000 |
| `pendingDocChanges` | 200 |
| `driftRepairs` | 25 |
| `redditResponses` | 100 |
| `agentDeployments` | 50 |
| `rssDrafts` | 200 |
| `rssSeenIds` | 400 |

When adding a new stateful collection to `OrchestratorState`, you must: (1) add the type to `types.ts`, (2) add a `LIMIT` constant to `state.ts`, (3) apply clamping in both `loadState` and `saveStateWithOptions`, (4) initialize to `[]` in `createDefaultState()`.

### Agent Architecture (`workspace/agents/`)

Each agent directory contains:
- `agent.config.json` — full config: `id`, `name`, `orchestratorStatePath`, `serviceStatePath`, `model` (primary/fallback/tier/temperature/maxTokens), `permissions.skills` (per-skill `{allowed, maxCalls, rateLimit}`), `permissions.fileSystem`, `permissions.network`, `constraints` (timeout/maxRetries/memory/cpu), `heartbeat`.
- `src/index.ts` — task handler entry point (spawned by orchestrator via `tsx src/index.ts <payloadPath>`).
- `src/service.ts` (doc-specialist, reddit-helper only) — persistent long-running service. **Must check `ALLOW_DIRECT_SERVICE=true` at startup or throw.**

**Task-spawned agents** (all except doc-specialist and reddit-helper): orchestrator runs `spawn(node, [tsxPath, 'src/index.ts', payloadPath], {cwd: agentRoot})` and reads result from `resultPath`. Orchestrator persists agent memory to `serviceStatePath` after each run (bounded timeline of last 120 tasks with `startedAt`/`completedAt`/`durationMs`/result/error).

**Permission enforcement flow:** `taskHandlers.ts` → `getToolGate()` → `gate.canExecuteTask(agentId, taskType)` checks `agent.config.json:orchestratorTask`. `gate.executeSkill(agentId, skillId, args)` checks `permissions.skills[skillId].allowed`. All invocations logged regardless of outcome.

**AgentRegistry** (`src/agentRegistry.ts`): Singleton. Loaded at startup from `workspace/agents/*/agent.config.json`. Exposes `getAgent(id)`, `canUseSkill(id, skillId)`, `getAllowedSkills(id)`, `validateAgent(id)`, `getAgentEntryPoint(id)`. AGENT_TEMPLATE dir is skipped.

**The 11 worker agents and their assigned skills:**

| Agent | Task Type | Primary Skill(s) |
|---|---|---|
| `market-research-agent` | `market-research` | sourceFetch |
| `data-extraction-agent` | `data-extraction` | documentParser, normalizer |
| `qa-verification-agent` | `qa-verification` | testRunner |
| `summarization-agent` | `summarize-content` | documentParser, normalizer |
| `build-refactor-agent` | `build-refactor` | workspacePatch, testRunner |
| `security-agent` | `security-audit` | documentParser, normalizer |
| `normalization-agent` | `normalize-data` | normalizer, documentParser |
| `content-agent` | `content-generate` | documentParser |
| `integration-agent` | `integration-workflow` | documentParser, normalizer |
| `skill-audit-agent` | `skill-audit` | testRunner, documentParser |
| `system-monitor-agent` | `system-monitor` | documentParser |

Model tiering: `gpt-4o-mini` (cheap, high-throughput) and `claude-3-5-sonnet` (balanced, reasoning). See `agent.config.json` `model.tier` for each agent's tier.

Each behavioral agent also has identity docs: `SOUL.md` (identity/character), `IDENTITY.md` (behavioral patterns), `USER.md` (user expectations), `ROLE.md`, `SCOPE.md`, `POLICY.md`, `TOOLS.md`, `HEARTBEAT.md`.

### Skills System (`workspace/skills/`)

Five core skills, all defined in `workspace/skills/` and registered in `workspace/skills/index.ts`:

| Skill ID | Description |
|---|---|
| `sourceFetch` | HTTP fetch with timeout, returns statusCode + content |
| `documentParser` | Parse PDF/HTML/CSV → structured blocks, tables, entities |
| `normalizer` | ETL normalization, schema mapping, validation |
| `workspacePatch` | Workspace file patching (code refactor, write ops) |
| `testRunner` | Execute test suites, return pass/fail + output |

**Skill execution flow:** `executeSkill(skillId, input, agentId?)` → check registry → check `auditPassed` → `getToolGate().executeSkill(agentId, skillId, args)` → run executor. Skills are audited at startup (`skillAudit.ts`) against 5 checks: provenance, permission bounds, dangerous runtimes, secret access, schema defined. Skills that fail audit are not registered.

**Shared telemetry** (`workspace/agents/shared/telemetry.ts`): `Telemetry` class wraps console + optional stream. All agents emit to `telemetryStream: http://localhost:8700/telemetry` (config in `agent.config.json`).

### Knowledge Pipeline

**Note:** There is no scheduled GitHub Actions trigger (`on.schedule`) for doc mirror sync, and no active cron job for sync scripts in the current cron store. Sync must be triggered manually or via workflow dispatch.

```
workspace/sync_docs_sources.sh
  ├─ workspace/sync_openclaw_docs.sh  → workspace/openclaw-docs/  (sparse-clone + rsync)
  └─ workspace/sync_openai_cookbook.sh → workspace/openai-cookbook/  (sparse-clone + rsync)

Orchestrator DocIndexer (chokidar) watches both roots via `indexRoots` variable
  └─ on change → enqueue doc-change task
       └─ doc-change → triggers drift-repair
            └─ spawn doc-specialist/src/index.ts with payload
                 └─ reads docs → builds knowledge pack JSON → writes to logs/knowledge-packs/

reddit-helper service
  └─ reads latest knowledge pack (findLatestKnowledgePack)
  └─ reads orchestrator_state.json rssDrafts
  └─ calls OpenAI (gpt-4, maxTokens 300, temp 0.7)
  └─ appends drafted replies to logs/reddit-drafts.jsonl
  └─ appends Devvit queue items to logs/devvit-submissions.jsonl
  └─ writes reply records back to orchestrator_state.json redditResponses
```

### Memory System (Four Layers)

**Layer A — Workspace Markdown (session continuity):**
- `workspace/MEMORY.md` — long-term curated memory. **Load ONLY in main/private session.** Never in group chats or shared contexts (security: contains personal context).
- `workspace/memory/YYYY-MM-DD.md` — daily tactical logs (safe in any context).
- `workspace/AGENTS.md` — session boot instructions (read SOUL → USER → daily memory files).

**Layer B — Orchestrator JSON state:**
- `workspace/orchestrator_state.json` — all runtime collections. Canonical source of truth for all agents. All agents reference this by absolute path in `orchestratorStatePath`.

**Layer C — Agent service state JSON:**
- `workspace/logs/<agent>-service.json` per agent — heartbeat state, task timeline, counters. Written by orchestrator's `taskHandlers.ts` for spawned agents; by each service itself for doc-specialist/reddit-helper.

**Agent Memory Key Matrix (verified absolute paths from `agents/*/agent.config.json`):**

| Agent | `orchestratorStatePath` | `serviceStatePath` |
|---|---|---|
| `AGENT_TEMPLATE` | `.openclaw/workspace/orchestrator_state.json` | `.openclaw/workspace/logs/template-agent-service.json` |
| `build-refactor-agent` | `.openclaw/workspace/orchestrator_state.json` | `.openclaw/workspace/logs/build-refactor-agent-service.json` |
| `content-agent` | `.openclaw/workspace/orchestrator_state.json` | `.openclaw/workspace/logs/content-agent-service.json` |
| `data-extraction-agent` | `.openclaw/workspace/orchestrator_state.json` | `.openclaw/workspace/logs/data-extraction-agent-service.json` |
| `doc-specialist` | `.openclaw/workspace/orchestrator_state.json` | `.openclaw/workspace/logs/doc-specialist-service.json` |
| `integration-agent` | `.openclaw/workspace/orchestrator_state.json` | `.openclaw/workspace/logs/integration-agent-service.json` |
| `market-research-agent` | `.openclaw/workspace/orchestrator_state.json` | `.openclaw/workspace/logs/market-research-agent-service.json` |
| `normalization-agent` | `.openclaw/workspace/orchestrator_state.json` | `.openclaw/workspace/logs/normalization-agent-service.json` |
| `qa-verification-agent` | `.openclaw/workspace/orchestrator_state.json` | `.openclaw/workspace/logs/qa-verification-agent-service.json` |
| `reddit-helper` | `.openclaw/workspace/orchestrator_state.json` | `.openclaw/workspace/logs/reddit-helper-service.json` |
| `security-agent` | `.openclaw/workspace/orchestrator_state.json` | `.openclaw/workspace/logs/security-agent-service.json` |
| `skill-audit-agent` | `.openclaw/workspace/orchestrator_state.json` | `.openclaw/workspace/logs/skill-audit-agent-service.json` |
| `summarization-agent` | `.openclaw/workspace/orchestrator_state.json` | `.openclaw/workspace/logs/summarization-agent-service.json` |
| `system-monitor-agent` | `.openclaw/workspace/orchestrator_state.json` | `.openclaw/workspace/logs/system-monitor-agent-service.json` |

All paths are under `/home/oneclickwebsitedesignfactory/`. `doc-specialist` additionally uses `knowledgePackDir`, `docsPath`, `cookbookPath`; `reddit-helper` additionally uses `knowledgePackDir`, `draftLogPath`, `devvitQueuePath`.

**Layer D — SQLite memory index:**
- `~/.openclaw/memory/<agentId>.sqlite` — OpenClaw platform memory search substrate. Managed by `session-memory` hook in `.openclaw/openclaw.json`. Default path pattern configurable via `agents.defaults.memorySearch.store.path`.

**Memory drift warning:** `workspace/docs/reference/state-schema.md` documents a DIFFERENT state path/schema style (`logs/orchestrator.state.json`) than the active runtime. Treat `orchestrator_config.json` + `orchestrator/src/state.ts` + `orchestrator/src/types.ts` as canonical for current runtime behavior. Do NOT use that doc as a reference.

**Canonical precedence rule (when docs conflict with code):**
1. Live code + config (`orchestrator/src/*.ts`, `orchestrator_config.json`, `agents/*/agent.config.json`, `.openclaw/openclaw.json`)
2. Operational docs (`AGENTS.md`, `MEMORY_SYSTEM_GUIDE.md`, `openclaw-docs/concepts/memory.md`)
3. Historical/proposal docs (advisory only, not authoritative)

**Memory scheduler** (`src/memory/scheduler.ts`):
- Hourly snapshots via `SnapshotService` → saved to MongoDB (`SnapshotDocument`).
- Daily consolidation at 1 AM via `ConsolidationEngine` → analyzes patterns (peak load time, cost trend, error trend, performance direction) → feeds `KnowledgeIntegration.onConsolidationComplete()` → updates KB.

### Persistence Layer (`src/persistence/`)

MongoDB-backed. Optional — non-fatal if unavailable (unless `strictPersistence: true` in config). Collections: snapshots, consolidations (via `COLLECTIONS` schema constants in `schemas.ts`). Connection: `DATABASE_URL` env var (default `mongodb://mongo:27017/orchestrator`), db name `DB_NAME` (default `orchestrator`). Pool size 10, idle timeout 60s.

### Metrics (`src/metrics/`)

Prometheus on port `9100`. Metrics exported:
- Agent task counters: `agentTasksStarted`, `agentTasksCompleted`, `agentTasksFailed`
- Agent active task gauge: `agentActiveTasks`
- Task duration histogram: `agentTaskDuration`
- Daily cost gauges: `agentCostPerDay`, `agentTotalCostPerDay`
- Skill access counters: `skillAccessAllowed`, `skillAccessDenied`
- Permission escalation counter: `permissionEscalationRequests`
- Active permissions gauge: `activePermissionsGranted`
- Audit violations: `auditViolationsLogged`
- Approval counters/histograms: `taskApprovalRequests`, `approvalResponseTime`, `pendingApprovalsCount`, `approvalAutoEscalated`

Approval SLA constants in `src/metrics/approval-metrics.ts`: `APPROVAL_SLA_MS`, `APPROVAL_ESCALATION_MS`.

### Alert System (`src/alerts/`)

`POST /webhook/alerts` → `AlertHandler.handleAlertManagerWebhook()` → per-alert: check severity → `alertDeduplicator` (prevents duplicate alerts) → route `critical` to both Slack (`slack-client.ts`) and SendGrid email (`sendgrid-client.ts`); lower severity to Slack only.

Notifier (`src/notifier.ts`): supports `slack` (webhook URL), `discord` (webhook URL), `email` (SMTP), `log` (stdout). Used by `send-digest` task handler.

### Milestone Pipeline (`src/milestones/schema.ts` ↔ `openclawdbot/`)

Orchestrator emits `MilestoneIngestEnvelope` events (Zod-validated) to the openclawdbot Devvit app:
- Schema shared between producer (orchestrator) and consumer (openclawdbot) via `MilestoneEventSchema`, `MilestoneIngestEnvelopeSchema`, `MilestoneIngestHeadersSchema`.
- Signed with `X-Openclaw-Signature` + `X-Openclaw-Timestamp` headers.
- Delivery endpoint: `POST /internal/milestones/ingest` (openclawdbot server).
- Feed endpoint: `GET /api/milestones/latest` (returns `MilestoneFeedResponse`).
- Idempotency key on every envelope prevents duplicate ingest.
- Evidence types: `doc`, `commit`, `issue`, `pr`, `runbook`, `metric`, `log`.
- Risk status: `on-track`, `at-risk`, `blocked`, `completed`.

### openclawdbot (`workspace/openclawdbot/`)

Reddit Devvit app. Two display surfaces:
- `game.html` → `src/client/` React 19 app (expanded view) — heavy, loads on click.
- `splash.html` → `src/client/` React 19 app (inline feed view) — must stay fast, no heavy deps.

Server: Hono + `@devvit/web/server`. Routes:
- `/api/*` — `api.ts` (init, increment, decrement) — uses `redis`, `reddit`, `context` from `@devvit/web/server`.
- `/internal/menu`, `/internal/form`, `/internal/triggers` — Devvit lifecycle hooks.
- Milestone ingest/feed routes (in `contracts/milestones.ts`).

Do NOT use `window.location`/`window.assign` — use `navigateTo` from `@devvit/web/client`. Do NOT use `window.alert` — use `showToast`/`showForm`. No inline `<script>` tags in HTML files.

---

## Key Conventions

### Config Loading

`src/config.ts` loads `orchestrator_config.json` from: (1) `customPath` argument, (2) `$ORCHESTRATOR_CONFIG` env var, (3) default path `../../orchestrator_config.json` relative to the built `dist/`. Throws if `docsPath`, `logsDir`, or `stateFile` are missing. Never hardcode paths.

### TypeScript Module Style (Orchestrator)

- `"type": "module"` — all imports must use `.js` extension even for `.ts` source files (e.g., `import { Foo } from './foo.js'`).
- Build: `tsc` → `dist/`. Dev: `tsx src/index.ts` (no build needed).
- Node.js v24 required (set in systemd `PATH` via nvm).

### Webhook Signing Contract

Header: `X-Webhook-Signature`. Algorithm: HMAC-SHA256. Encoding: lowercase hex. The orchestrator also accepts `sha256=<hex>` prefix format (normalized in `middleware/auth.ts`). Signature comparison uses `crypto.timingSafeEqual`. See `workspace/docs/WEBHOOK_SIGNING_CONTRACT.md` for complete spec with Node.js examples.

**Canonicalization rule:** Recursively sort all JSON object keys lexicographically, preserve array order, then `JSON.stringify`. Reference: `canonicalizeJson()` in `middleware/auth.ts`.

### API Key Rotation

Primary key: `API_KEY` env var. Additional rotation keys: `API_KEY_ROTATION` env var as JSON array of `{key, version, createdAt, expiresAt, active}`. Keys have 90-day default expiration. Expiring-soon keys (within 14 days) set `X-API-Key-Expires` response header. Startup rejects if no valid active key exists.

### ALLOW_DIRECT_SERVICE Guard

`doc-specialist/src/service.ts` and `reddit-helper/src/service.ts` both check `process.env.ALLOW_DIRECT_SERVICE !== 'true'` and throw immediately if not set. The systemd units set this env var. This prevents accidental direct execution outside of systemd.

### Protected Path Policy (DO NOT SKIP)

Before deleting or pruning ANY file, run the full Protected Path Derivation in `workspace/docs/GOVERNANCE_REPO_HYGIENE.md`:
1. Collect all paths from `orchestrator_config.json`.
2. Expand agent IO paths from `agents/*/agent.config.json`.
3. Check trigger surfaces (`systemd/*.service`, `cron/jobs.json`, `.github/workflows/*`).
4. Check sync/fetch scripts.
5. Scan runtime code for consumption.
6. Classify: `PROTECTED` / `PROTECTED-BUT-PRUNABLE` / `CANDIDATE` / `DRIFT-RISK`.

Key protected config keys from `orchestrator_config.json`: `docsPath`, `cookbookPath`, `knowledgePackDir`, `logsDir`, `stateFile`, `redditDraftsPath`, `digestDir`, `rssConfigPath`.

Only `CANDIDATE` paths (zero-hit across all scans) may be removed. `DRIFT-RISK` = do not touch without operator intent. `openclaw.json.bak*` files are current `CANDIDATE` (no runtime references found).

### Anchor Recon Workflow

Re-run evidence scans and update anchor whenever: `orchestrator_config.json` changes, a new `systemd/*.service` file appears, agent config IO paths change, or sync scripts are edited.

1. Run `workspace/scripts/audit_context_anchor_recon.sh` — writes to `workspace/logs/audits/context-anchor/context-anchor-recon-YYYYMMDD-HHMMSS.txt`.
2. Update `.openclaw/OPENCLAW_CONTEXT_ANCHOR.md` from the evidence output.
3. Update `workspace/README.md` and `workspace/docs/INDEX.md` if public navigation changed.
4. Update sprint doc status if milestone acceptance criteria changed.
Never update the anchor from memory — always derive from evidence.

### Doc Drift Contracts

`workspace/scripts/check-doc-drift.sh` enforces existence of: `README.md`, `QUICKSTART.md`, `DEPLOYMENT.md`, `docs/INDEX.md`, `docs/NAVIGATION.md`, `docs/operations/SPRINT_TO_COMPLETION.md`, `docs/operations/clawdbot-milestone-delivery-plan.md`, `docs/CLAWDBOT_MILESTONES.md`, `scripts/audit_context_anchor_recon.sh`. If you move or rename any of these, update both `check-doc-drift.sh` and `OPENCLAW_CONTEXT_ANCHOR.md` in the same commit.

### State Collection Retention Pattern

```typescript
// When adding a new bounded collection:
const MY_COLLECTION_LIMIT = 100;  // add to state.ts

// In loadState():
myCollection: parsed.myCollection?.slice(-MY_COLLECTION_LIMIT) ?? [],

// In saveStateWithOptions():
myCollection: state.myCollection.slice(-MY_COLLECTION_LIMIT),

// In createDefaultState():
myCollection: [],

// In OrchestratorState (types.ts):
myCollection: MyCollectionItemType[];
```

### Adding a New Task Type

When adding a new task type:
1. Add to `ALLOWED_TASK_TYPES` array in `taskHandlers.ts`.
2. Add to `TaskTriggerSchema` Zod enum in `middleware/validation.ts`.
3. Add handler function to `taskHandlers` map in `taskHandlers.ts`.
4. If it requires approval, add to `approvalRequiredTaskTypes` in `orchestrator_config.json`.
5. If it spawns an agent, add to `SPAWNED_AGENT_PERMISSION_REQUIREMENTS` map.

### Adding a New Agent

Use `workspace/agents/AGENT_TEMPLATE/` as the base. Required steps:
1. Copy `AGENT_TEMPLATE/` to `agents/<new-agent>/`.
2. Update `agent.config.json`: set `id`, `name`, `orchestratorTask`, `orchestratorStatePath` (absolute), `serviceStatePath` (absolute), `permissions.skills`.
3. Implement `src/index.ts` — receives task payload path as `process.argv[2]`, writes result JSON.
4. Add agent identity docs (SOUL.md, IDENTITY.md, etc.) for behavioral consistency.
5. Add corresponding task type (see above).
6. AgentRegistry discovers it automatically on next orchestrator start.

---

## Infrastructure and Services

### Systemd Services

All three services use nvm-managed Node.js v24 (`/home/oneclickwebsitedesignfactory/.nvm/versions/node/v24.12.0/bin/`):

| Service | WorkingDirectory | ExecStart | Notes |
|---|---|---|---|
| `orchestrator.service` | `workspace/orchestrator` | `node dist/index.js` | MemoryMax=1G, CPUQuota=80%, Restart=always |
| `doc-specialist.service` | `workspace/agents/doc-specialist` | `node .../tsx/dist/cli.mjs src/service.ts` | `ALLOW_DIRECT_SERVICE=true`, Restart=always |
| `reddit-helper.service` | `workspace/agents/reddit-helper` | `node .../tsx/dist/cli.mjs src/service.ts` | `ALLOW_DIRECT_SERVICE=true`, Restart=always |

tsx binary path for agent services: `workspace/node_modules/tsx/dist/cli.mjs` (root workspace `node_modules`, not orchestrator).

### Docker Compose

**Root stack** (`workspace/docker-compose.yml`): single `orchestrator` service. Port `3000:3000`. Config mounted read-only. Health check: file-based (`orchestrator_state.json` exists).

**Full stack** (`workspace/orchestrator/docker-compose.yml`): `orchestrator` + `mongo:7.0.3` + `redis:7.0.10-alpine` + `prometheus` + `grafana` + `alertmanager`. Orchestrator health: `curl -f http://localhost:3000/health`. Mongo/Redis ports bound to `127.0.0.1` only. Orchestrator depends on healthy mongo and redis.

Required env vars for full stack (use `.env` file in `workspace/orchestrator/`):
```
API_KEY, WEBHOOK_SECRET, MONGO_USERNAME, MONGO_PASSWORD, REDIS_PASSWORD
OPENAI_API_KEY, ANTHROPIC_API_KEY
DATABASE_URL, REDIS_URL
```

### Cron Jobs (`.openclaw/cron/jobs.json`)

OpenClaw daemon cron store. The actual file location is **`.openclaw/cron/jobs.json`** — `workspace/cron/` does NOT exist. Current jobs are both `enabled: false`. Jobs use `schedule.kind: "every"` with `everyMs` and `anchorMs`. The `integration-progress-reminder` and `reddit-digest-auto` jobs are disabled reminder/digest payload jobs for the main agent session.

Orchestrator internal cron (node-cron, inside orchestrator process — separate from OpenClaw cron):
- Nightly batch: `0 23 * * *` UTC (configurable via `nightlyBatchSchedule`)
- Morning digest: `0 6 * * *` UTC (configurable via `morningNotificationSchedule`)
- Heartbeat: every 5 minutes

### OpenClaw Runtime Config (`.openclaw/openclaw.json`)

Key settings for AI sessions:
- `agents.defaults.model.primary`: `openai/gpt-5.2-codex`
- `agents.defaults.workspace`: `workspace/` absolute path
- `agents.defaults.maxConcurrent`: 4
- `agents.defaults.subagents.maxConcurrent`: 8
- `agents.defaults.compaction.mode`: `safeguard`
- `agents.defaults.sandbox.mode`: `off`
- `hooks.internal.entries.session-memory.enabled`: `true`
- `channels.telegram.enabled`: `true`, `dmPolicy: "pairing"`, `groupPolicy: "allowlist"`
- `gateway.port`: 18789

---

## Session Boot Protocol (For AI Sessions in This Workspace)

On every session start, before doing anything else:
1. Read `workspace/SOUL.md` — identity and decision posture.
2. Read `workspace/USER.md` — who you're helping (John, Europe/London, prefers proactive updates).
3. Read `workspace/memory/YYYY-MM-DD.md` for today and yesterday.
4. **If in main/private session only:** Also read `workspace/MEMORY.md` — do NOT load in group chats or shared contexts.

The operator (John) uses Europe/London timezone. Prefers proactive status updates.
