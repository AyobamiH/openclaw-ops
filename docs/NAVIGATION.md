---
title: "Documentation Navigation"
summary: "How to find what you're looking for in the docs."
---

# Documentation Navigation

This guide helps you find the right documentation for your need.

---

## By Role

### 📌 I'm Closing Remaining Gaps

**Use this sequence**:
1. [Sprint To Completion](./operations/SPRINT_TO_COMPLETION.md) — Current closure plan
2. [CLAWDBOT Milestones](./CLAWDBOT_MILESTONES.md) — Milestone source contract
3. [Milestone Delivery Plan](./operations/clawdbot-milestone-delivery-plan.md) — Integration path to app
4. [Milestone Pipeline Runbook](./operations/MILESTONE_PIPELINE_RUNBOOK.md) — Setup, backfill, dead-letter ops
5. [Operator Guide](./OPERATOR_GUIDE.md) — Runtime reality checks

---

### 👤 I'm New to This System

**Start here**:
1. [Getting Started](./start/getting-started.md) — 5-minute setup
2. [Architecture Overview](./start/architecture-overview.md) — Conceptual overview (non-technical)
3. [System Architecture](./concepts/architecture.md) — How it works (technical)

---

### 🛠️ I'm Deploying/Running It

**Follow this path**:
1. [Getting Started](./start/getting-started.md) — Prerequisites and install
2. [Installation Guide](./guides/installation.md) — Detailed setup for different environments
3. [Configuration](./guides/configuration.md) — Configure orchestrator_config.json
4. [Running Agents](./guides/running-agents.md) — Deploy and manage agents
5. [Deployment](./operations/deployment.md) — Production deployment checklist
6. [Monitoring](./guides/monitoring.md) — Track system health

---

### 🐛 Something's Broken

**Troubleshooting**:
1. [Common Issues](./troubleshooting/common-issues.md) — FAQ and quick fixes
2. [Debugging Guide](./troubleshooting/debugging.md) — Diagnostic procedures
3. [State Recovery](./operations/backup-recovery.md) — Restore from backup

---

### 👨‍💻 I'm Extending It

**For developers**:
1. [Adding Custom Tasks](./guides/adding-tasks.md) — Create task handlers
2. [API Reference](./reference/api.md) — Types, interfaces, functions
3. [Task Types](./reference/task-types.md) — All built-in tasks
4. [State Schema](./reference/state-schema.md) — Data structures

---

### 📋 I Need a Checklist

**Fast paths**:
- **Deploy to production**: [Deployment Checklist](./operations/deployment.md)
- **Set up backups**: [Backup & Recovery](./operations/backup-recovery.md)
- **Verify health**: [Monitoring](./guides/monitoring.md)
- **Quick install**: [Quick Start](./start/quickstart.md)

---

## By Topic

### Installation & Setup
- [Getting Started](./start/getting-started.md) — Fast setup
- [Installation](./guides/installation.md) — Detailed install
- [Configuration](./guides/configuration.md) — Config options
- [Quick Start](./start/quickstart.md) — 5-minute checklist

### Understanding the System
- [Architecture Overview](./start/architecture-overview.md) — Non-technical
- [System Architecture](./concepts/architecture.md) — Technical deep-dive
- [Task Types](./reference/task-types.md) — What tasks do

### Operations
- [Running Agents](./guides/running-agents.md) — Agent management
- [Monitoring](./guides/monitoring.md) — Health checks
- [Deployment](./operations/deployment.md) — Production setup
- [Backup & Recovery](./operations/backup-recovery.md) — Disaster recovery

### Troubleshooting
- [Common Issues](./troubleshooting/common-issues.md) — FAQ
- [Debugging](./troubleshooting/debugging.md) — Diagnostics

### Development
- [Adding Tasks](./guides/adding-tasks.md) — Custom handlers
- [API Reference](./reference/api.md) — API docs
- [State Schema](./reference/state-schema.md) — Data structures

---

## File Map

```
docs/
├── start/                           ← NEW USERS START HERE
│   ├── getting-started.md          ← 5-minute setup
│   ├── quickstart.md               ← Checklist
│   └── architecture-overview.md    ← Non-technical intro
│
├── concepts/
│   └── architecture.md             ← How system works (technical)
│
├── guides/
│   ├── installation.md             ← Detailed setup
│   ├── configuration.md            ← Config reference
│   ├── running-agents.md           ← Agent management
│   ├── monitoring.md               ← Health & observability
│   └── adding-tasks.md             ← Custom task handlers
│
├── reference/
│   ├── task-types.md               ← All 8 task types
│   ├── state-schema.md             ← Data structures
│   └── api.md                      ← API reference
│
├── troubleshooting/
│   ├── common-issues.md            ← FAQ & quick fixes
│   └── debugging.md                ← Diagnostic guide
│
├── operations/
│   ├── deployment.md               ← Production checklist
│   └── backup-recovery.md          ← Backup & recovery
│
├── README.md                        ← Docs index
├── INDEX.md                         ← This document
└── SUMMARY.md                       ← (optional: generated doc list)
```

---

## Search Tips

Looking for something specific?

| I want to... | Look here |
|---|---|
| Install the system | [`docs/start/getting-started.md`](./start/getting-started.md) |
| Understand what it does | [`docs/start/architecture-overview.md`](./start/architecture-overview.md) |
| Configure orchestrator_config.json | [`docs/guides/configuration.md`](./guides/configuration.md) |
| Deploy to production | [`docs/operations/deployment.md`](./operations/deployment.md) |
| Debug a broken system | [`docs/troubleshooting/debugging.md`](./troubleshooting/debugging.md) |
| Monitor health | [`docs/guides/monitoring.md`](./guides/monitoring.md) |
| Operate milestone pipeline | [`docs/operations/MILESTONE_PIPELINE_RUNBOOK.md`](./operations/MILESTONE_PIPELINE_RUNBOOK.md) |
| Create a custom task | [`docs/guides/adding-tasks.md`](./guides/adding-tasks.md) |
| Understand task types | [`docs/reference/task-types.md`](./reference/task-types.md) |
| Backup/restore system | [`docs/operations/backup-recovery.md`](./operations/backup-recovery.md) |
| See all API types | [`docs/reference/api.md`](./reference/api.md) |
| Fix a specific issue | [`docs/troubleshooting/common-issues.md`](./troubleshooting/common-issues.md) |

---

## Learning Paths

### Path 1: Get It Running (30 minutes)
1. [Getting Started](./start/getting-started.md) — Setup
2. [Quick Start](./start/quickstart.md) — Verify
3. ✅ System running

### Path 2: Understand It (1 hour)
1. [Architecture Overview](./start/architecture-overview.md) — Conceptual
2. [System Architecture](./concepts/architecture.md) — Technical
3. [Task Types](./reference/task-types.md) — What runs
4. ✅ Understand the design

### Path 3: Deploy Safely (2 hours)
1. [Installation](./guides/installation.md) — Setup
2. [Configuration](./guides/configuration.md) — Configure
3. [Deployment](./operations/deployment.md) — Checklist
4. [Monitoring](./guides/monitoring.md) — Verify
5. [Backup & Recovery](./operations/backup-recovery.md) — Protect
6. ✅ Production ready

### Path 4: Extend It (3+ hours)
1. [API Reference](./reference/api.md) — Interfaces
2. [State Schema](./reference/state-schema.md) — Data structures
3. [Adding Tasks](./guides/adding-tasks.md) — Build custom handlers
4. [Task Types](./reference/task-types.md) — Reference
5. ✅ Can create custom extensions

### Path 5: Troubleshoot Issues (varies)
1. Check logs: `tail -f logs/orchestrator.log`
2. [Common Issues](./troubleshooting/common-issues.md) — Look up error
3. [Debugging Guide](./troubleshooting/debugging.md) — Diagnose
4. [Backup & Recovery](./operations/backup-recovery.md) — Recover if needed
5. ✅ Issue resolved

---

## Related Workspace Files

Also read:

- **[SOUL.md](../SOUL.md)** — Workspace identity and values
- **[AGENTS.md](../AGENTS.md)** — Agent governance and conventions
- **[IDENTITY.md](../IDENTITY.md)** — System identity
- **[HEARTBEAT.md](../HEARTBEAT.md)** — Health check configuration
- **[MEMORY.md](../MEMORY.md)** — Long-term context (if available)

---

## Getting Help

- **Stuck?** Start with [Common Issues](./troubleshooting/common-issues.md)
- **Need diagnostics?** See [Debugging Guide](./troubleshooting/debugging.md)
- **Building something?** Check [Adding Tasks](./guides/adding-tasks.md)
- **System broken?** Follow [Backup & Recovery](./operations/backup-recovery.md)

---

📖 **Choose your starting point above, then follow the links from there!**
