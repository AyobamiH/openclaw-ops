# OpenClaw Orchestrator: Deployment Guide

## Overview

OpenClaw is a **21-hour comprehensive monitoring and memory system** built on a modern cloud-native stack. This guide covers deployment, configuration, and operations.

**Architecture:** Prometheus → Grafana → AlertManager → Knowledge Base → MongoDB Persistence

**Deployment Time:** ~30 minutes (Docker Compose)  
**Tech Stack:** Node.js 20, TypeScript, Express.js, MongoDB, Redis, Prometheus, Grafana  
**Phases Completed:** 1-8 (Full Stack)

---

## Quick Start (Docker Compose)

### Prerequisites

- Docker & Docker Compose
- 4GB+ RAM
- Linux/macOS/Windows with WSL2

### Step 1: Clone & Setup

```bash
cd orchestrator/
cp .env.example .env
# Edit .env with your API credentials
```

### Step 2: Configure Environment

```env
# .env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=claude-...
SENDGRID_API_KEY=SG...
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
DATABASE_URL=mongodb://mongo:27017/orchestrator
REDIS_URL=redis://redis:6379/0
NODE_ENV=production
```

### Step 3: Deploy

```bash
# Build Docker image
docker-compose build orchestrator

# Start all services
docker-compose up -d

# Verify services are running
docker-compose ps

# Check health
curl http://localhost:3000/health
```

### Step 4: Access Dashboards

- **Prometheus:** http://localhost:9090
- **Grafana:** http://localhost:3001
- **Orchestrator:** http://localhost:3000
- **AlertManager:** http://localhost:9093

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    OpenClaw 21-Hour System                       │
├─────────────────────────────────────────────────────────────────┤

Phase 1 & 2: METRICS & DASHBOARDS
├─ Prometheus (port 9090): Collects 16+ custom metrics
├─ Grafana (port 3001): 3 interactive dashboards
└─ Metrics Server: Exposed on port 9100/metrics

Phase 3: ALERTING
├─ AlertManager (port 9093): 11 alert rules with deduplication
├─ Slack Webhooks: Real-time notifications
└─ SendGrid: Daily digest emails

Phase 4: MEMORY CONSOLIDATION
├─ Hourly Snapshots: Captures state every hour
├─ Daily Consolidation (1 AM UTC): Analyzes 24-hour trends
└─ Storage: ./data/snapshots/ (line-delimited JSON)

Phase 5: KNOWLEDGE BASE
├─ Pattern Analyzer: Identifies recurring issues
├─ KB Engine: Persistent storage (./data/knowledge-base/)
└─ Concept Mapper: Semantic relationship graph

Phase 6: PERSISTENCE LAYER
├─ MongoDB (port 27017): 9 persistent collections
├─ Data Models: Metrics, alerts, KB, concepts, audit logs
└─ HTTP API: /api/persistence/* endpoints

SUPPORTING SERVICES
├─ Redis (port 6379): Caching & session storage
└─ Express.js (port 3000): REST API & webhooks
└──────────────────────────────────────────────────────────────────
```

---

## Service Configuration

### Prometheus

**Config File:** `monitoring/prometheus.yml`

Key settings:
- Scrape interval: 15 seconds
- Evaluation interval: 15 seconds
- Alert rules: 11 rules across 4 categories
  - App Performance (3 rules)
  - Infrastructure (3 rules)
  - Anomalies (3 rules)
  - Business Metrics (2 rules)

**Custom Metrics:**
- `orchestrator_tasks_total` - Task execution count
- `orchestrator_alerts_total` - Alert volume
- `orchestrator_memory_mb` - Memory usage
- `orchestrator_latency_ms` - Response latency (P50/P95/P99)
- `orchestrator_costs_daily` - Daily cost estimate

### Grafana

**Dashboards:**
1. **Operational Dashboard** - Task execution, alerts, health
2. **Cost Dashboard** - Daily costs, resource utilization
3. **Security Dashboard** - Audit logs, access patterns

**Datasources:**
- Prometheus (http://openclaw-prometheus:9090)
- All dashboards auto-sync with Prometheus metrics

### MongoDB

**Collections (9 total):**
- `metrics` - Time-series data (indexed by timestamp)
- `alerts` - Alert history (indexed by severity)
- `knowledge_base` - Learned patterns & solutions
- `consolidations` - Daily trend analysis
- `snapshots` - Hourly system state
- `system_state` - Configuration & state variables
- `audit_logs` - Complete action trail
- `concepts` - Knowledge graph nodes
- `concept_links` - Semantic relationships

**Retention Policies:**
- Metrics: 90 days rolling
- Alerts: 48 hours
- Snapshots: 30 days
- KB entries: Permanent

### Redis

**Purpose:** Caching, session storage, rate limiting

**Key Patterns:**
- `metric:*` - Metric cache (TTL: 1 min)
- `alert:*` - Alert deduplication (TTL: 10 min)
- `session:*` - User sessions (TTL: 24 h)

---

## API Endpoints

### Health & Status

```bash
# Full health check
GET /health
# Response: { status, timestamp, endpoints }

# Persistence health
GET /api/persistence/health
# Response: { status, database, collections }
```

### Knowledge Base (Phase 5)

```bash
# Query knowledge base
POST /api/knowledge/query
Body: { query: "string" }
# Returns: { success, results: {entries, concepts, solutions}, sources }

# Get KB summary
GET /api/knowledge/summary
# Returns: { lastUpdated, stats, networkStats, topIssues, recentLearnings }

# Export KB
GET /api/knowledge/export?format=json|markdown
# Returns: KB as JSON or Markdown
```

### Persistence (Phase 6)

```bash
# Database health
GET /api/persistence/health
# Returns: { status, database, collections }

# Historical data
GET /api/persistence/historical?days=30
# Returns: period, metricsCount, alertsCount, knowledgeBase, consolidations

# Database stats
GET /api/persistence/export
# Returns: exportDate, collections, databaseSize
```

### Alert Webhooks (Phase 3)

```bash
# AlertManager webhook (called by AlertManager)
POST /webhook/alerts
Body: {
  "status": "firing|resolved",
  "alerts": [
    {
      "status": "firing",
      "labels": { "alertname", "severity", ... },
      "annotations": { ... }
    }
  ]
}
```

---

## Monitoring & Operations

### View Logs

```bash
# Orchestrator logs
docker logs openclaw-orchestrator -f

# MongoDB logs
docker logs openclaw-mongo -f

# Prometheus logs
docker logs openclaw-prometheus -f

# Grafana logs
docker logs openclaw-grafana -f
```

### Health Checks

```bash
# All services
docker-compose ps

# MongoDB connection
docker exec openclaw-mongo mongosh --eval "db.adminCommand('ping')"

# Redis connection
docker exec openclaw-redis redis-cli ping

# Prometheus scraping
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[].health'
```

### Common Operations

```bash
# Restart a service
docker-compose restart orchestrator

# View resource usage
docker stats openclaw-*

# Connect to MongoDB
docker exec -it openclaw-mongo mongosh
> db.metrics.find().limit(5)
> db.knowledge_base.countDocuments()

# Connect to Redis
docker exec -it openclaw-redis redis-cli
> KEYS *
> DBSIZE
```

---

## Troubleshooting

### Container Fails to Start

```bash
# Check logs
docker logs openclaw-orchestrator

# Common issues:
# 1. Port already in use
lsof -i :3000
kill -9 <PID>

# 2. MongoDB not ready
docker logs openclaw-mongo
# Solution: Wait 5-10 seconds before starting orchestrator

# 3. Insufficient resources
docker stats
# Solution: Allocate more RAM in Docker settings
```

### MongoDB Connection Errors

```bash
# Test connection
docker exec openclaw-orchestrator \
  mongosh "mongodb://mongo:27017/orchestrator" \
  --eval "db.adminCommand('ping')"

# If authentication fails:
# Edit docker-compose.yml, ensure MongoDB has --noauth flag
# Or update connection string with credentials
```

### Alerts Not Triggering

```bash
# Check AlertManager config
curl http://localhost:9093/api/v1/alerts

# Verify Prometheus scraping
curl http://localhost:9090/api/v1/targets

# Check alert rules
curl http://localhost:9090/api/v1/rules | jq '.data.groups[].rules'
```

### Knowledge Base Empty

```bash
# Check if consolidations are running
docker logs openclaw-orchestrator | grep "Consolidation"

# Manually trigger consolidation
curl -X POST http://localhost:3000/webhook/trigger-consolidation

# Check snapshot data
docker exec openclaw-mongo mongosh \
  -u orchestrator -p orchestrator-dev \
  --authenticationDatabase admin \
  --eval "db.snapshots.find().limit(5)"
```

---

## Performance Tuning

### Node.js Memory

```env
# In docker-compose.yml
environment:
  NODE_OPTIONS="--max-old-space-size=1024"
```

### MongoDB Optimization

```javascript
// Connect as admin
use admin
db.createCollection("metrics", {
  timeseries: {
    timeField: "timestamp",
    metaField: "labels"
  }
})
```

### Redis Configuration

```bash
# Increase memory limit
docker exec openclaw-redis redis-cli CONFIG SET maxmemory 512mb
```

---

## Backup & Recovery

### Backup MongoDB

```bash
# Full backup
docker exec openclaw-mongo mongodump \
  --out /backup/mongodb-$(date +%Y%m%d)

# Backup to host
docker exec openclaw-mongo mongodump | gzip > backup.tar.gz
```

### Backup Prometheus Data

```bash
# Prometheus data is in volumes/orchestrator_prometheus-data/
docker run --rm -v orchestrator_prometheus-data:/data \
  -v $(pwd):/backup alpine \
  tar czf /backup/prometheus-$(date +%Y%m%d).tar.gz /data
```

### Restore

```bash
# Restore MongoDB
docker exec openclaw-mongo mongorestore /backup/mongodb-DATE

# Restore Prometheus
# Stop container, restore volume, restart
```

---

## Production Deployment Checklist

- [ ] Set strong passwords for MongoDB, Redis
- [ ] Configure HTTPS/TLS certificates
- [ ] Set up log aggregation (ELK Stack, DataDog, etc.)
- [ ] Configure backup schedule
- [ ] Set up monitoring alerts for container health
- [ ] Configure resource limits in docker-compose
- [ ] Enable audit logging
- [ ] Set up auto-restart policies
- [ ] Configure redundancy/failover
- [ ] Test disaster recovery procedures

---

## Support & Resources

**Documentation:**
- Phase 1-2: `docs/monitoring-setup.md`
- Phase 3: `docs/alerting-rules.md`
- Phase 4: `docs/memory-consolidation.md`
- Phase 5: `docs/knowledge-base.md`
- Phase 6: `docs/persistence-layer.md`

**Logs & Metrics:**
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001
- Application logs: `./logs/`
- Metrics export: `/api/persistence/export`

---

**Last Updated:** February 23, 2026  
**Version:** 1.0.0 (Complete 21-Hour System)  
**Status:** Production Ready

