---
title: "Orchestrator Documentation"
summary: "Complete documentation for the AI agent orchestration system."
read_when:
  - Learning how the system works
  - Deploying orchestrator
  - Managing agents
---

# Orchestrator Documentation 🦆

Welcome to the orchestrator system documentation. This is a control center for autonomous AI agents — managing documentation, scheduling tasks, coordinating specialized agents, and maintaining system state.

## Quick Navigation

### Repo Completion
- **[Sprint To Completion](./operations/SPRINT_TO_COMPLETION.md)** — Active gap-closure plan mapped to runtime reality
- **[CLAWDBOT Milestones](./CLAWDBOT_MILESTONES.md)** — Milestone model and publication rules
- **[Milestone Delivery Plan](./operations/clawdbot-milestone-delivery-plan.md)** — Producer → bridge → Reddit app flow
- **[Milestone Ingest Contract](./operations/MILESTONE_INGEST_CONTRACT.md)** — Endpoint/payload contract for app ingestion
- **[Milestone Pipeline Runbook](./operations/MILESTONE_PIPELINE_RUNBOOK.md)** — Setup, backfill, secret rotation, dead-letter diagnosis

### Getting Started
- **[Quick Start (root)](../QUICKSTART.md)** — Local dev vs Docker paths, env vars, openclawdbot deploy
- **[Deployment Guide (root)](../DEPLOYMENT.md)** — Full Docker Compose + systemd deployment reference
- **[Getting Started](./start/getting-started.md)** — Install and run the orchestrator in 5 minutes
- **[Architecture Overview](./start/architecture-overview.md)** — Non-technical explanation for stakeholders
- **[Quick Start](./start/quickstart.md)** — Minimal setup checklist

### Core Concepts
- **[System Architecture](./concepts/architecture.md)** — How orchestrator, agents, and docs connect
- **[Orchestrator Design](./concepts/orchestrator.md)** — The brain: scheduling, task queuing, state
- **[Agents](./concepts/agents.md)** — Specialized workers and how to create new ones
- **[Knowledge Base](./concepts/knowledge-base.md)** — Documentation mirror and syncing
- **[Memory System](./concepts/memory.md)** — Short-term and long-term persistence
- **[Task Model](./concepts/tasks.md)** — Task types, handlers, and execution model

### Guides & Recipes
- **[Installation](./guides/installation.md)** — Detailed setup for different environments
- **[Configuration](./guides/configuration.md)** — Configuring orchestrator_config.json
- **[Running Agents](./guides/running-agents.md)** — Deploying and managing agent workers
- **[Adding New Tasks](./guides/adding-tasks.md)** — Creating new task handlers
- **[Monitoring & Health](./guides/monitoring.md)** — Heartbeat, logs, and observability
- **[Automation & Cron](./guides/automation.md)** — Scheduled tasks and background jobs

### References
- **[Configuration Reference](./reference/configuration.md)** — All config options explained
- **[API Reference](./reference/api.md)** — Task handlers and state schemas
- **[Task Types](./reference/task-types.md)** — All built-in task types
- **[State Schema](./reference/state-schema.md)** — Complete state structure
- **[CLI Commands](./reference/cli.md)** — Command reference
- **[Webhook Signing Contract](./WEBHOOK_SIGNING_CONTRACT.md)** — Canonical HMAC rules for `/webhook/alerts`

### Troubleshooting
- **[Common Issues](./troubleshooting/common-issues.md)** — FAQ and solutions
- **[Debugging](./troubleshooting/debugging.md)** — How to diagnose problems
- **[Performance](./troubleshooting/performance.md)** — Optimization and tuning
- **[Security](./troubleshooting/security.md)** — Security practices and audit

### Operational
- **[Deployment Playbook](./operations/deployment.md)** — Production checklist
- **[Backup & Recovery](./operations/backup.md)** — State preservation
- **[Scaling](./operations/scaling.md)** — Running multiple instances
- **[Metrics & Observability](./operations/observability.md)** — Monitoring setup

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────┐
│  Orchestrator (Control Plane)                   │
│  ├─ Doc Indexer (watches docs)                  │
│  ├─ Task Queue (schedules work)                 │
│  ├─ Task Handlers (executes work)               │
│  └─ State Manager (remembers)                   │
└──────────────┬──────────────────────────────────┘
               │
      ┌────────┼────────┐
      │        │        │
      ▼        ▼        ▼
   Agents   Knowledge  Logs
   (work)   Base (ref) (audit)
```

---

## Key Files & Directories

| Path | Purpose |
|------|---------|
| `orchestrator/` | Main Node.js runtime (TypeScript) |
| `orchestrator/src/index.ts` | System bootstrap and scheduler |
| `orchestrator/src/taskHandlers.ts` | All task handler implementations |
| `agents/` | Agent templates (doc-specialist, reddit-helper, shared) |
| `openclaw-docs/` | Local mirror of official OpenClaw documentation |
| `logs/` | Artifacts: drafts, knowledge packs, sync logs |
| `memory/` | Daily logs and curated long-term memory |
| `orchestrator_config.json` | Configuration (paths, settings) |
| `SOUL.md` | Workspace identity and values |
| `AGENTS.md` | Agent governance and workspace conventions |

---

## Typical Workflows

### Start the System
```bash
cd orchestrator
npm install
npm run build
npm start
```

### Check Status
```bash
# View task history
tail -f logs/orchestrator.log

# View Reddit drafts
tail -n 20 logs/reddit-drafts.jsonl

# Check state
cat logs/state.json | jq '.taskHistory[-5:]'
```

### Sync Official Docs
```bash
./sync_openclaw_docs.sh
```

### Deploy a New Agent
```bash
# Trigger agent-deploy task
node -e "
import('./orchestrator/dist/index.js');
// inject into queue: { type: 'agent-deploy', payload: { ... } }
"
```

---

## Learning Path

**If you're new:**
1. Read [Getting Started](./start/getting-started.md)
2. Review [Architecture Overview](./start/architecture-overview.md) (non-technical)
3. Run the [Quick Start](./start/quickstart.md)

**If you're deploying:**
1. Follow [Installation](./guides/installation.md)
2. Read [Configuration](./guides/configuration.md)
3. Check [Deployment Playbook](./operations/deployment.md)

**If you're developing:**
1. Read [System Architecture](./concepts/architecture.md)
2. Review [Task Model](./concepts/tasks.md)
3. Follow [Adding New Tasks](./guides/adding-tasks.md)

**If something breaks:**
1. Check [Common Issues](./troubleshooting/common-issues.md)
2. Read [Debugging](./troubleshooting/debugging.md)
3. Review [State Schema](./reference/state-schema.md)

---

## Key Principles

- **Declarative configuration** — All settings in `orchestrator_config.json`, environment-friendly
- **Audit everything** — Every task recorded with timestamp, status, result
- **Graceful degradation** — Missing components don't crash the system
- **Self-healing** — Agents retry failed work; orchestrator persists state across crashes
- **Isolated agents** — Agents are spawned processes; failures don't cascade
- **Knowledge-driven** — Agents consult docs before answering; docs auto-update

---

## Support & Contributing

- **Issues**: Check [Troubleshooting](./troubleshooting/)
- **Contributing**: See `CONTRIBUTING.md` in root
- **Community**: OpenClaw Discord linked in main README
