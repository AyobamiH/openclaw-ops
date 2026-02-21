---
title: "README"
summary: "Orchestrator System — AI Agent Coordination"
---

# Orchestrator System 🦆

A self-hosted control center for autonomous AI agents. Manages documentation, schedules tasks, coordinates specialized agents, and maintains system state.

## What It Does

- **Watches documentation** for changes and propagates updates to agents
- **Schedules tasks** (doc syncing, Reddit monitoring, RSS scanning) automatically
- **Coordinates agents** like specialists answering Reddit questions or analyzing docs
- **Maintains state** so the system survives restarts without losing progress
- **Audits everything** with complete task history and logs

## Key Files

- `orchestrator/` — Main Node.js runtime
- `agents/` — Specialized workers (doc-specialist, reddit-helper)
- `docs/` — **Complete documentation** (start here ➡️)
- `SOUL.md`, `AGENTS.md`, `IDENTITY.md` — Workspace conventions
- `orchestrator_config.json` — Configuration

## Quick Start

```bash
cd orchestrator
npm install
npm run build
npm start
```

Then check [docs/](./docs/) for guides.

## Documentation

**📖 Full docs live in [`docs/`](./docs/)**

- **New?** → [Getting Started](./docs/start/getting-started.md)
- **Stakeholder overview?** → [Architecture Overview](./docs/start/architecture-overview.md)
- **Deploy?** → [Installation](./docs/guides/installation.md)
- **Something broken?** → [Troubleshooting](./docs/troubleshooting/common-issues.md)
- **Deep dive?** → [System Architecture](./docs/concepts/architecture.md)

## Architecture at a Glance

```
[Orchestrator]
├─ Watches docs, schedules tasks
├─ Spans agents (doc-specialist, reddit-helper)
└─ Persists state to disk

[Agents]
├─ Specialized workers
├─ Run as isolated processes
└─ Report results back

[Knowledge Base]
├─ Local OpenClaw docs mirror
├─ Auto-syncs every 6 hours
└─ Consulted by every agent
```

## Key Capabilities

| Feature | Purpose |
|---------|---------|
| **Doc Indexing** | Watches for documentation changes |
| **Task Scheduling** | Runs work on intervals (1m, 5m, 10m, 15m) |
| **Agent Spawning** | Launches workers as isolated Node processes |
| **State Persistence** | Survives crashes, remembers progress |
| **Audit Trail** | Complete task history and logs |
| **Knowledge Packs** | Summarized doc changes for agents |
| **Reddit Integration** | Monitors and drafts responses |
| **RSS Scanning** | Filters and prioritizes feed content |

## Workspace Structure

```
.openclaw/workspace/
├── orchestrator/              # Main runtime (TypeScript/Node)
│   ├── src/
│   │   ├── index.ts          # Bootstrap & scheduler
│   │   ├── taskHandlers.ts   # All task implementations
│   │   ├── state.ts          # Persistence
│   │   └── ...
│   ├── dist/                 # Compiled (after npm run build)
│   └── package.json
│
├── agents/                    # Agent templates
│   ├── doc-specialist/        # Analyzes doc changes
│   ├── reddit-helper/         # Answers Reddit questions
│   └── shared/                # Shared utilities
│
├── docs/                      # This documentation
│   ├── start/                 # Getting started guides
│   ├── concepts/              # Architecture & design
│   ├── guides/                # How-to guides
│   ├── reference/             # API docs
│   └── troubleshooting/       # Common issues
│
├── openclaw-docs/             # Local OpenClaw docs mirror
├── logs/                      # Artifacts (state, drafts, packs)
├── memory/                    # Daily logs & curated history
│
├── SOUL.md                    # Identity & values
├── AGENTS.md                  # Agent governance
├── IDENTITY.md                # Workspace identity
├── HEARTBEAT.md               # Health checking config
├── orchestrator_config.json   # Main configuration
└── sync_openclaw_docs.sh      # Docs sync script (cron-able)
```

## Running

### Development

```bash
cd orchestrator
npm run dev    # Watch mode with live reload
```

### Production

```bash
cd orchestrator
npm run build
npm start      # Single process (use PM2 or systemd for supervision)
```

### Check Status

```bash
# View logs
tail -f logs/orchestrator.log

# View state
cat logs/orchestrator.state.json | jq

# Check heartbeat
grep heartbeat logs/orchestrator.log | tail -5
```

## Configuration

See [`orchestrator_config.json`](./orchestrator_config.json) for the default. Key settings:

```json
{
  "docsPath": "./openclaw-docs",           # Docs to index
  "logsDir": "./logs",                      # Output artifacts
  "stateFile": "./logs/orchestrator.state.json",  # Persistence
  "rssConfigPath": "./rss_filter_config.json",    # RSS rules
  "redditDraftsPath": "./logs/reddit-drafts.jsonl" # Drafts log
}
```

Override via environment:

```bash
export ORCHESTRATOR_CONFIG=/path/to/config.json
npm start
```

---

## Next Steps

1. **[Read the full documentation](./docs/)**
2. **[Install and run](./docs/start/getting-started.md)**
3. **[Understand the architecture](./docs/start/architecture-overview.md)**
4. **[Deploy for production](./docs/guides/installation.md)**

---

**Questions?** Check [docs/troubleshooting/](./docs/troubleshooting/) or open an issue.
