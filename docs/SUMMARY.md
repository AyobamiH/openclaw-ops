---
title: "Documentation Summary"
summary: "Complete list of documentation files and their purposes."
---

# Documentation Summary

This workspace includes comprehensive documentation organized by topic and audience.

---

## Quick Links

**New here?** → [Getting Started](./start/getting-started.md)

**How does it work?** → [Architecture Overview](./start/architecture-overview.md)

**Deploy it?** → [Deployment Checklist](./operations/deployment.md)

**Something broken?** → [Troubleshooting](./troubleshooting/common-issues.md)

---

## Complete File List

### Start / Getting Started

| File | Purpose | Audience |
|------|---------|----------|
| [getting-started.md](./start/getting-started.md) | 5-minute setup and verification | Everyone |
| [quickstart.md](./start/quickstart.md) | Checklist for quick deployment | Operators |
| [architecture-overview.md](./start/architecture-overview.md) | Non-technical system explanation | Stakeholders |

### Concepts / Architecture

| File | Purpose | Audience |
|------|---------|----------|
| [architecture.md](./concepts/architecture.md) | Technical deep-dive into system design | Developers |

### Guides / How-To

| File | Purpose | Audience |
|------|---------|----------|
| [installation.md](./guides/installation.md) | Detailed installation for different environments | Operators, Developers |
| [configuration.md](./guides/configuration.md) | Configuration file reference | Operators |
| [running-agents.md](./guides/running-agents.md) | Deploy and manage agents | Operators, Developers |
| [monitoring.md](./guides/monitoring.md) | System health checks and observability | Operators |
| [adding-tasks.md](./guides/adding-tasks.md) | Create custom task handlers | Developers |

### Reference / Technical

| File | Purpose | Audience |
|------|---------|----------|
| [task-types.md](./reference/task-types.md) | All 8 built-in task types with examples | Developers, Operators |
| [state-schema.md](./reference/state-schema.md) | Complete state data structure | Developers |
| [api.md](./reference/api.md) | API reference (types, interfaces, functions) | Developers |

### Troubleshooting / Support

| File | Purpose | Audience |
|------|---------|----------|
| [common-issues.md](./troubleshooting/common-issues.md) | FAQ and quick fixes | Everyone |
| [debugging.md](./troubleshooting/debugging.md) | Diagnostic procedures and debugging tips | Operators, Developers |

### Operations / Production

| File | Purpose | Audience |
|------|---------|----------|
| [deployment.md](./operations/deployment.md) | Production deployment checklist | Operators |
| [backup-recovery.md](./operations/backup-recovery.md) | Backup strategy and recovery procedures | Operators |

---

## By Audience

### 👤 New Users
- [Getting Started](./start/getting-started.md) — Installation basics
- [Architecture Overview](./start/architecture-overview.md) — How it works
- [Common Issues](./troubleshooting/common-issues.md) — Quick help

### 🔧 Operators / DevOps
- [Installation](./guides/installation.md) — Full setup
- [Configuration](./guides/configuration.md) — Tuning
- [Running Agents](./guides/running-agents.md) — Management
- [Monitoring](./guides/monitoring.md) — Health checks
- [Deployment](./operations/deployment.md) — Production
- [Backup & Recovery](./operations/backup-recovery.md) — Protection

### 👨‍💻 Developers
- [System Architecture](./concepts/architecture.md) — Design
- [Adding Tasks](./guides/adding-tasks.md) — Extensions
- [API Reference](./reference/api.md) — Functions & types
- [State Schema](./reference/state-schema.md) — Data structures
- [Task Types](./reference/task-types.md) — Task reference

### 📊 Stakeholders
- [Architecture Overview](./start/architecture-overview.md) — Non-technical overview
- [Quick Start](./start/quickstart.md) — Status checklist

---

## By Topic

### Installation & Deployment
- Quick: [Getting Started](./start/getting-started.md)
- Detailed: [Installation](./guides/installation.md)
- Checklist: [Quick Start](./start/quickstart.md)
- Production: [Deployment](./operations/deployment.md)

### Configuration & Operations
- [Configuration Guide](./guides/configuration.md)
- [Running Agents](./guides/running-agents.md)
- [Monitoring](./guides/monitoring.md)

### Understanding the System
- Non-technical: [Architecture Overview](./start/architecture-overview.md)
- Technical: [System Architecture](./concepts/architecture.md)
- Tasks: [Task Types](./reference/task-types.md)

### Development & Extension
- Creating tasks: [Adding Tasks](./guides/adding-tasks.md)
- API: [API Reference](./reference/api.md)
- Data: [State Schema](./reference/state-schema.md)

### Support & Troubleshooting
- Quick fixes: [Common Issues](./troubleshooting/common-issues.md)
- Debugging: [Debugging Guide](./troubleshooting/debugging.md)
- Recovery: [Backup & Recovery](./operations/backup-recovery.md)

---

## Content Statistics

| Category | Files | Total Sections | Approx. Length |
|----------|-------|-----------------|---|
| Start | 3 | 15+ | 2000 words |
| Concepts | 1 | 10+ | 3000 words |
| Guides | 5 | 50+ | 8000 words |
| Reference | 3 | 40+ | 5000 words |
| Troubleshooting | 2 | 30+ | 4000 words |
| Operations | 2 | 20+ | 3000 words |
| **Total** | **16** | **165+** | **25000+ words** |

---

## Navigation Hub

- [📖 Full Navigation Guide](./NAVIGATION.md) — How to find what you need
- [README.md](./README.md) — Quick overview
- [INDEX.md](./INDEX.md) — Master index with search

---

## How Documentation is Organized

```
docs/
├── start/              ← Quick start (5 min - 1 hour)
├── concepts/           ← Understanding (architecture)
├── guides/             ← How-to recipes (setup, config, extend)
├── reference/          ← Technical reference (API, types, tasks)
├── troubleshooting/    ← Problem-solving (issues, debugging)
└── operations/         ← Production operations (deploy, backup)
```

Each document:
- ✅ Has a clear purpose and audience
- ✅ Contains examples and code snippets
- ✅ Links to related documents
- ✅ Shows commands you can copy-paste
- ✅ Includes troubleshooting for that topic

---

## Finding Information Quickly

**Use this table when you need to find something:**

| Need | Start Here |
|------|-----------|
| Get system running | [Getting Started](./start/getting-started.md) |
| Understand system | [Architecture Overview](./start/architecture-overview.md) |
| Deploy to production | [Deployment](./operations/deployment.md) |
| Fix a problem | [Common Issues](./troubleshooting/common-issues.md) |
| Check system health | [Monitoring](./guides/monitoring.md) |
| Create custom task | [Adding Tasks](./guides/adding-tasks.md) |
| See task types | [Task Types](./reference/task-types.md) |
| Understand data | [State Schema](./reference/state-schema.md) |
| Backup/restore | [Backup & Recovery](./operations/backup-recovery.md) |
| API reference | [API Reference](./reference/api.md) |
| Diagnose problem | [Debugging](./troubleshooting/debugging.md) |
| Learn system design | [Architecture](./concepts/architecture.md) |

---

## Keeping Up to Date

Documentation is updated when:
- New features are added
- Major issues are discovered
- Configuration changes
- Best practices improve

**Check the date** on each file (in front matter or last modified timestamp).

---

**[← Back to Navigation](./NAVIGATION.md) | [Back to README](./README.md)**
