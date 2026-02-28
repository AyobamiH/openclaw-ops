# OpenClaw Orchestrator Workspace

Production-style, self-hosted multi-agent runtime for OpenClaw operations.

This repository is the workspace control plane: it runs an orchestrator, manages specialized agents, indexes local doc mirrors, generates knowledge packs, and supports both API-driven and service-driven execution paths.

## GitHub Navigation Tabs

Use this as the top-level navigation model when publishing the repo.

| Tab | Purpose | Start Here |
|---|---|---|
| Overview | What this project is and its runtime modes | `README.md` |
| Quick Start | Get running fast with local dev | `QUICKSTART.md` |
| Docker + Deploy | Containerized and system deployment paths | `DEPLOYMENT.md`, `docs/operations/deployment.md` |
| Operations | Day-2 operations, boundaries, runbooks | `docs/OPERATOR_GUIDE.md`, `docs/operations/MILESTONE_PIPELINE_RUNBOOK.md` |
| Architecture | Technical and non-technical system explanation | `docs/concepts/architecture.md`, `ARCHITECTURE_NONTECHNICAL.md` |
| Milestones + Reddit | Milestone pipeline: emit → sign → ingest → Reddit feed | `docs/CLAWDBOT_MILESTONES.md`, `docs/operations/MILESTONE_PIPELINE_RUNBOOK.md` |
| Sprint To Completion | Active implementation plan to close known gaps | `docs/operations/SPRINT_TO_COMPLETION.md` |
| Documentation Audit | Canonical vs historical doc classification | `docs/operations/DOCUMENT_AUDIT.md` |
| Governance + Security | Drift control, repo hygiene, trust boundaries | `OPENCLAW_CONTEXT_ANCHOR.md`, `docs/GOVERNANCE_REPO_HYGIENE.md`, `security/` |

## Highlights

- Orchestrator API with queue-based task execution and retries.
- Allowlisted task model with explicit approval gates for sensitive task types.
- Spawned-agent execution contract with structured result files.
- Direct service mode for selected agents (`doc-specialist`, `reddit-helper`).
- Local docs + cookbook mirror indexing (`openclaw-docs`, `openai-cookbook`).
- State persistence, memory timeline updates, and audit-oriented runtime artifacts.
- Optional full observability stack via Docker Compose (MongoDB, Redis, Prometheus, Grafana, Alertmanager).

## Architecture At A Glance

```
Clients / Schedulers / Watchers
            |
            v
      Orchestrator API
            |
            v
        Task Queue
            |
            v
      Task Handlers
      |          |
      |          +--> Spawned Agents (agents/*/src/index.ts)
      |
      +--> State + Approvals + Audit + Memory
            |
            +--> Knowledge Packs + Draft Logs
```

## Runtime Modes

### 1) Orchestrator-Driven Multi-Agent Mode (Primary)

Use this mode for centralized scheduling, policy, approvals, and history.

Execution flow:

1. Task enters via API (`/api/tasks/trigger`), scheduler, or doc watcher.
2. Task type is validated against allowlist.
3. Handler executes inline logic or spawns an agent process.
4. Result is interpreted by orchestrator and persisted (`ok`/`error`).

### 2) Direct Agent Service Mode (Secondary)

Use this mode when intentionally running independent service loops:

- `agents/doc-specialist/src/service.ts`
- `agents/reddit-helper/src/service.ts`

Guardrail: direct service mode requires `ALLOW_DIRECT_SERVICE=true`.

## Repository Structure

- `orchestrator/` - Node.js/TypeScript orchestrator runtime.
- `agents/` - Agent implementations + `AGENT_TEMPLATE`.
- `docs/` - Project docs, KB, governance, runbooks.
- `openclaw-docs/` - Local mirror of OpenClaw docs.
- `openai-cookbook/` - Local mirror of OpenAI cookbook.
- `systemd/` - Service unit definitions.
- `orchestrator_config.json` - Runtime path + behavior configuration.
- `orchestrator_state.json` - Primary persisted orchestrator state.
- `OPENCLAW_CONTEXT_ANCHOR.md` - Canonical runtime/governance anchor.

Note: `workspace/OPENCLAW_CONTEXT_ANCHOR.md` is a non-canonical stub; root `OPENCLAW_CONTEXT_ANCHOR.md` is canonical.

## Task System

Task types are deny-by-default and centrally allowlisted in `orchestrator/src/taskHandlers.ts`.

Current allowlisted task types include:

- `startup`, `doc-change`, `doc-sync`, `drift-repair`, `reddit-response`
- `security-audit`, `summarize-content`, `system-monitor`, `build-refactor`
- `content-generate`, `integration-workflow`, `normalize-data`, `market-research`
- `data-extraction`, `qa-verification`, `skill-audit`
- `rss-sweep`, `nightly-batch`, `send-digest`, `heartbeat`, `agent-deploy`

## HTTP API

Default port: `3000`.

Public endpoints:

- `GET /health`
- `GET /api/knowledge/summary`
- `GET /api/openapi.json`
- `GET /api/persistence/health`

Protected endpoints:

- `POST /api/tasks/trigger`
- `POST /webhook/alerts` (signature validated)
- `GET /api/approvals/pending`
- `POST /api/approvals/:id/decision`
- `GET /api/dashboard/overview`
- `GET /api/memory/recall`
- `POST /api/knowledge/query`
- `GET /api/knowledge/export`
- `GET /api/persistence/historical`
- `GET /api/persistence/export`

## Scheduling

Built-in schedules in orchestrator runtime:

- `nightly-batch` (default cron `0 23 * * *`)
- `send-digest` (default cron `0 6 * * *`)
- `heartbeat` every 5 minutes

Additional watchdog timers monitor missed heartbeats and perform alert cleanup.

## Local Development

You do not need the `openclaw` CLI to run this workspace.

Prerequisites:

- Node.js 20+
- npm

Run orchestrator:

```bash
cd orchestrator
npm install
API_KEY=local-dev-key \
WEBHOOK_SECRET=local-webhook-secret \
MONGO_USERNAME=local \
MONGO_PASSWORD=local \
REDIS_PASSWORD=local \
ORCHESTRATOR_FAST_START=true \
npm run dev
```

Build + start:

```bash
cd orchestrator
npm run build
npm start
```

Key scripts (`orchestrator/package.json`):

- `npm run dev`
- `npm run build`
- `npm start`
- `npm test`
- `npm run test:integration`
- `npm run test:coverage`
- `npm run openapi:generate`

## Docker

This repo intentionally keeps two Docker Compose paths:

### A) Root Minimal Compose

File: `docker-compose.yml`

Purpose:

- Lightweight orchestrator-focused container path.

Run:

```bash
cd /path/to/workspace
docker compose up -d --build
docker compose ps
```

### B) Full Orchestrator Stack Compose

File: `orchestrator/docker-compose.yml`

Purpose:

- Orchestrator + MongoDB + Redis + Prometheus + Grafana + Alertmanager.

Run:

```bash
cd /path/to/workspace/orchestrator
docker compose up -d --build
docker compose ps
```

Service ports (monitoring services bound to 127.0.0.1):

| Service | Port | URL |
|---|---|---|
| Orchestrator API | 3000 | `http://localhost:3000` |
| MongoDB | 27017 | `127.0.0.1` only |
| Redis | 6379 | `127.0.0.1` only |
| Prometheus | 9090 | `http://127.0.0.1:9090` |
| Grafana | 3001 | `http://127.0.0.1:3001` |
| Alertmanager | 9093 | `http://127.0.0.1:9093` |

Dashboards provisioned automatically from `orchestrator/monitoring/dashboards/`:

- `agent-performance.json`
- `cost-tracking.json`
- `security-approvals.json`

Important:

- These compose files are deliberately different.
- They are not drop-in equivalents.
- Running both simultaneously can create port/container conflicts.

## systemd Services

Under `systemd/`:

- `orchestrator.service`
- `doc-specialist.service`
- `reddit-helper.service`
- Additional services for task-specific agents (`build-refactor-agent`, `content-agent`, `security-agent`, etc.).

## Configuration

Primary runtime config: `orchestrator_config.json`.

Important keys include:

- `docsPath`, `cookbookPath`
- `logsDir`, `stateFile`
- `milestoneIngestUrl` — deployed openclawdbot ingest URL (empty = delivery disabled)
- `knowledgePackDir`, `redditDraftsPath`, `digestDir`
- `approvalRequiredTaskTypes`
- `nightlyBatchSchedule`, `morningNotificationSchedule`

The runtime treats code + config as source of truth when docs drift.

## Knowledge + Memory Pipeline

- Sync chain: `sync_docs_sources.sh` -> `sync_openclaw_docs.sh` + `sync_openai_cookbook.sh`.
- Orchestrator indexes mirror roots via `DocIndexer`.
- `doc-specialist` writes knowledge packs.
- `reddit-helper` consumes drafts/packs and writes response artifacts.
- Orchestrator maintains per-agent service memory timelines in each agent `serviceStatePath`.

## Milestone Pipeline (Orchestrator → Reddit)

Runtime events (startup, nightly-batch, drift-repair, agent-deploy) are published as signed milestones to the `openclawdbot` Reddit app.

```
Orchestrator task completes
  → MilestoneEmitter.emit()          validates (Zod) + appends to logs/milestones.jsonl
  → deliverPending()                 HMAC-SHA256 signs envelope with MILESTONE_SIGNING_SECRET
  → POST /internal/milestones/ingest verifies signature + Redis dedup + stores in feed
  → realtime.send()                  live push to all open Reddit clients
  → GET /api/milestones/latest       splash + game views on Reddit
```

Required env / config:

| What | Where |
|---|---|
| `MILESTONE_SIGNING_SECRET` | `orchestrator/.env` (256-bit hex, never commit) |
| `milestoneIngestUrl` | `orchestrator_config.json` (deployed openclawdbot URL) |
| Devvit app secret | `devvit settings set milestoneSigningSecret` (same value) |

Backfill historical events:

```bash
docker exec -it <orchestrator-container> npm run milestones:backfill
```

Check dead-letter queue (ingest rejections):

```bash
curl https://<openclawdbot-host>/api/milestones/dead-letter
```

Full operator runbook: `docs/operations/MILESTONE_PIPELINE_RUNBOOK.md`

## Security And Secrets

- Never commit real secrets (`.env`, API keys, webhook secrets, tokens).
- Keep local runtime/state artifacts out of public commits (`logs/`, `memory/`, `orchestrator_state.json`, service state files).
- Use `.env.example` placeholders only.

## Documentation Map

- Main docs index: `docs/INDEX.md`
- Docs navigation map: `docs/NAVIGATION.md`
- Operator docs: `docs/OPERATOR_GUIDE.md`
- KB: `docs/OPENCLAW_KB/README.md`
- Governance: `docs/GOVERNANCE_REPO_HYGIENE.md`
- Execution contract: `docs/OPENCLAW_KB/operations/AGENT_EXECUTION_CONTRACT.md`
- Canonical anchor: `OPENCLAW_CONTEXT_ANCHOR.md`
- Sprint plan: `docs/operations/SPRINT_TO_COMPLETION.md`
- **Milestone pipeline runbook**: `docs/operations/MILESTONE_PIPELINE_RUNBOOK.md`
- Milestone delivery plan: `docs/operations/clawdbot-milestone-delivery-plan.md`
- Milestone ingest contract: `docs/operations/MILESTONE_INGEST_CONTRACT.md`

## Repository Hygiene Rule

Before deleting anything, regenerate protected-path allowlists using governance policy and runtime evidence. Do not classify files as junk heuristically.

## License / Ownership

Internal project repository. Follow `AGENTS.md` and governance docs for contribution and operational boundaries.
