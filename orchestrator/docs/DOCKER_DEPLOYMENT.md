# STAGE 3: Docker Deployment Guide

**Date:** February 22, 2026  
**Stage:** 3 of 5  
**Status:** ✅ COMPLETE  

---

## Overview

STAGE 3 implements containerized deployment of the 12-agent orchestrator system. A single monolithic Docker image contains the orchestrator, all 11 agents, and supporting infrastructure (MongoDB, Redis, Prometheus, Grafana).

---

## Architecture

### Monolithic Container Image
Single image containing:
- **Orchestrator Core** - Agent registration, task routing, ToolGate permission enforcement
- **11 Agents** - All deployed agents in production configuration
- **Runtime Dependencies** - Node.js 20, npm, essential system tools
- **Health Checks** - Liveness/readiness probes

### Supporting Services (docker-compose)
- **MongoDB** - Persistent state, audit trails, agent configs
- **Redis** - Cache layer, session storage, task queues
- **Prometheus** - Metrics collection (cost, latency, errors, health)
- **Grafana** - Visualization dashboards
- **AlertManager** - Alert routing and deduplication

---

## Files Created

### Dockerfile (60 lines)
Multi-stage build for production-ready image:

**Stage 1: Dependencies**
- Lightweight Alpine base (node:20-alpine)
- Install production npm dependencies only
- Minimal layer footprint

**Stage 2: Builder**
- Full dependency installation (dev + prod)
- TypeScript compilation (src → dist)
- Test suite preparation

**Stage 3: Production**
- Alpine base for security/size
- Only production dependencies (from stage 1)
- Non-root user (orchestrator:1001)
- Health checks enabled
- dumb-init for proper signal handling
- Resource limits: --max-old-space-size=512MB
- Port 3000 exposed

### docker-compose.yml (140 lines)
Local development environment with 6 services:

**Primary Services:**
1. **orchestrator** - Main application (port 3000)
   - Development mode with hot reload
   - Volume mounts for src code
   - Health check every 30s

2. **mongo** - MongoDB 7.0 (port 27017)
   - Persistent data volume
   - Authentication enabled
   - Init script support

3. **redis** - Redis 7 (port 6379)
   - RDB persistence (appendonly)
   - Password protected
   - Data volume mounted

**Monitoring Services:**
4. **prometheus** - Metrics collection (port 9090)
   - Auto-discovers metrics from orchestrator
   - 15s scrape interval
   - Historical data storage

5. **grafana** - Dashboards (port 3001)
   - Pre-configured Prometheus datasource
   - Dashboard provisioning
   - User management

6. **alertmanager** - Alert routing (port 9093)
   - Rule-based alert processing
   - Multi-channel routing
   - Alert grouping/deduplication

**Networking:**
- Custom bridge network (orchestrator-net)
- Service-to-service discovery via DNS
- Health checks with dependencies

### .dockerignore (65 lines)
Optional files excluded from build context:
- node_modules, test files, documentation
- .git, .env, development files
- IDE settings, logs, temporary files
- Reduces build context size by ~80%

---

## Quick Start

### Prerequisites
```bash
# Install Docker Engine 24+ and Docker Compose 2+
docker --version
docker-compose --version

# Set environment variables
cp orchestrator/.env.example orchestrator/.env
# Edit .env with your API keys:
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=claude-...
# MONGO_PASSWORD=...
# REDIS_PASSWORD=...
# GRAFANA_PASSWORD=...
```

### Build and Run Locally
```bash
# Build image (first time only)
docker-compose build

# Start all services
docker-compose up -d

# Verify services are healthy
docker-compose ps
docker-compose logs orchestrator

# Access endpoints:
# Orchestrator: http://localhost:3000
# Prometheus:  http://localhost:9090
# Grafana:     http://localhost:3001 (admin/admin)
```

### Test the Orchestrator
```bash
# Health check
curl http://localhost:3000/health

# List agents
curl http://localhost:3000/api/agents

# Submit task
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "market-research-agent",
    "skillId": "sourceFetch",
    "input": { "url": "https://example.com" }
  }'

# Get task status
curl http://localhost:3000/api/tasks/{taskId}

# Audit trail
curl http://localhost:3000/api/audit?limit=100
```

---

## Image Specifications

### Multi-Stage Build Strategy

**Why Multi-Stage?**
- Separates build tools from runtime
- Reduces final image size by ~70%
- Improves security (no build tools in prod)
- Faster builds (layer caching)

### Build Time & Size Estimates

| Metric | Value |
|--------|-------|
| **Build Time** | 5-8 minutes (first build) |
| **Build Time** | 30-60s (subsequent builds with cache) |
| **Image Size** | ~350-400 MB base image |
| **With Dependencies** | ~420-480 MB total |
| **Runtime Memory** | 512 MB limit (configurable) |

### Layer Optimization

1. **Dependencies** (Stage 1)
   - Cached separately
   - Re-used if package.json unchanged
   - ~150 MB uncompressed

2. **Builder** (Stage 2)
   - TypeScript: src/ → dist/
   - Tests: optional, discarded in final image
   - ~200 MB intermediate

3. **Production** (Stage 3)
   - Only deps + dist + config
   - Non-root user
   - Security hardened
   - ~420 MB final

---

## Production Deployment

### Docker Hub / Container Registry

```bash
# Tag image for registry
docker tag wagging-orchestrator:latest \
  registry.example.com/orchestrator:1.0.0
docker tag wagging-orchestrator:latest \
  registry.example.com/orchestrator:latest

# Push to registry
docker push registry.example.com/orchestrator:1.0.0
docker push registry.example.com/orchestrator:latest
```

### Docker Swarm
```bash
# Initialize swarm (single machine)
docker swarm init

# Create overlay network
docker network create -d overlay orchestrator-net

# Deploy stack
docker stack deploy -c docker-compose.yml orchestrator
```

### Pull and Run
```bash
# Pull from registry
docker pull registry.example.com/orchestrator:latest

# Run on different machine
docker run -d \
  --name orchestrator \
  -p 3000:3000 \
  -e OPENAI_API_KEY=sk-... \
  -e ANTHROPIC_API_KEY=claude-... \
  registry.example.com/orchestrator:latest
```

---

## Environment Variables

### Required (Production)
```bash
# API Keys
OPENAI_API_KEY=sk-...              # Required: OpenAI
ANTHROPIC_API_KEY=claude-...       # Required: Anthropic

# Database
DATABASE_URL=mongodb://...         # Required: MongoDB connection
MONGO_PASSWORD=...                 # Required: MongoDB auth

# Cache
REDIS_URL=redis://...              # Required: Redis connection
REDIS_PASSWORD=...                 # Required: Redis auth

# Application
NODE_ENV=production                # production | development
LOG_LEVEL=info                     # debug | info | warn | error
PORT=3000                          # API server port
```

### Optional (Monitoring)
```bash
# Monitoring
PROMETHEUS_ENABLED=true            # Enable Prometheus metrics
PROMETHEUS_PORT=9090               # Prometheus scrape port
GRAFANA_ENABLED=true               # Enable Grafana
GRAFANA_PORT=3001                  # Grafana access port
GRAFANA_PASSWORD=admin             # Grafana admin password

# Limits
MAX_AGENTS=40                       # Max concurrent agents
MAX_TASKS_PER_SECOND=100           # Rate limit
COST_BUDGET_CAP=20                 # £20 monthly cap
```

---

## Health Checks

### Liveness Check (Is service alive?)
```bash
curl http://localhost:3000/health
# Response: { "status": "healthy", "timestamp": "2024-02-22T..." }
```

**Docker Compose Config:**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s          # Check every 30 seconds
  timeout: 10s           # Wait 10s for response
  retries: 3             # Allow 3 failures before restart
  start_period: 40s      # Wait 40s before first check
```

### Readiness Check (Is service ready to serve?)
```bash
curl http://localhost:3000/ready
# Response: { "ready": true, "agents": 11, "skills": 5 }
```

### Deep Health Check (Full validation)
```bash
curl http://localhost:3000/api/health/deep
# Response includes: agents status, database connectivity, Redis status, etc.
```

---

## Networking

### Service Discovery (Docker Compose)
Services can communicate using DNS names:
```
orchestrator:3000    # App
mongo:27017          # Database
redis:6379           # Cache
prometheus:9090      # Metrics
grafana:3000         # Dashboards
```

### Port Mappings

| Service | Internal | External | Purpose |
|---------|----------|----------|---------|
| orchestrator | 3000 | 3000 | API |
| mongo | 27017 | 27017 | Database |
| redis | 6379 | 6379 | Cache |
| prometheus | 9090 | 9090 | Metrics |
| grafana | 3000 | 3001 | UI (must remap for local) |

---

## Scaling

### Horizontal Scaling (Multiple containers)

```yaml
# docker-compose-swarm.yml
services:
  orchestrator:
    deploy:
      replicas: 3          # 3 instances
      placement:
        constraints: [node.role == worker]
      update_config:
        parallelism: 1
        delay: 10s
```

### Load Balancing
```bash
# Docker Swarm provides built-in VIP load balancing
# All requests to 'orchestrator' service DNS automatically distributed

# Or use external load balancer (HAProxy, Nginx)
curl http://load-balancer.example.com/ -> distributed to 3 instances
```

### State Persistence
- **MongoDB**: Shared across all instances (single source of truth)
- **Redis**: Shared cache across instances
- **Audit Trail**: Centralized in MongoDB (no duplication)

---

## Security Best Practices

### Container Security

✅ **Non-Root User**
```dockerfile
USER orchestrator    # UID 1001
```

✅ **Signal Handling**
```dockerfile
ENTRYPOINT ["/usr/sbin/dumb-init", "--"]
```

✅ **Read-Only Filesystem** (optional)
```yaml
read_only: true
tmpfs:
  - /app/tmp
  - /app/logs
```

✅ **Resource Limits**
```yaml
deploy:
  resources:
    limits:
      cpus: '1'
      memory: 512M
    reservations:
      cpus: '0.5'
      memory: 256M
```

✅ **Network Isolation**
```yaml
networks:
  - orchestrator-net
```

✅ **Secret Management**
```bash
# Never commit  .env
echo ".env" >> .gitignore

# Use Docker Secrets (Swarm Mode)
docker secret create api-key api-key.txt
```

---

## Monitoring via Docker

### View Logs
```bash
# Orchestrator logs
docker-compose logs orchestrator

# Follow logs in real-time
docker-compose logs -f orchestrator

# Last 100 lines
docker-compose logs --tail=100 orchestrator

# From specific time
docker-compose logs --since 2024-02-22T10:00:00 orchestrator
```

### Stats
```bash
# CPU, memory, network usage
docker stats

# Single container
docker stats orchestrator
```

### Event Monitoring
```bash
# Watch container events
docker events --filter type=container
```

---

## Troubleshooting

### Container Won't Start
```bash
# Check image exists
docker images | grep orchestrator

# Rebuild from scratch
docker-compose build --no-cache

# Check build logs
docker build -t wagging-orchestrator . `date "+%s"` 2>&1 | tail -50
```

### Health Check Failing
```bash
# Check container logs
docker-compose logs orchestrator

# Test health endpoint from host
curl http://localhost:3000/health

# Test from inside container
docker-compose exec orchestrator curl http://localhost:3000/health
```

### Database Connection Issues
```bash
# Verify MongoDB is running
docker-compose logs mongo

# Test connection
docker-compose exec orchestrator node -e \
  "const m = require('mongodb'); \
   new m.MongoClient('mongodb://orchestrator:pass@mongo:27017').connect() \
   .then(() => console.log('Connected!')).catch(e => console.log(e.message))"
```

### Out of Memory
```bash
# Check memory usage
docker stats orchestrator

# Increase limit (docker-compose.yml)
deploy:
  resources:
    limits:
      memory: 1G

# Or restart with higher limit
docker-compose restart orchestrator
```

---

## Performance Tuning

### Node.js Optimization
```bash
# In Dockerfile
ENV NODE_OPTIONS="--max-old-space-size=512 --enable-source-maps"
```

### MongoDB Connection Pool
```bash
# Set in DATABASE_URL
mongodb://user:pass@mongo:27017/db?maxPoolSize=50
```

### Redis Memory Policy
```bash
# In docker-compose
command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
```

---

## Updating the Image

### Development Workflow
```bash
# 1. Make code changes
# 2. Rebuild (layer cache helps)
docker-compose build

# 3. Restart service
docker-compose restart orchestrator

# 4. View logs
docker-compose logs -f orchestrator
```

### Production Update
```bash
# 1. Build new version
docker build -t registry.example.com/orchestrator:v2.0.0 .

# 2. Push to registry
docker push registry.example.com/orchestrator:v2.0.0

# 3. Update service
docker service update --image registry.example.com/orchestrator:v2.0.0 orchestrator

# 4. Monitor rollout
docker service ps orchestrator
```

---

## Cleanup

### Remove Containers
```bash
docker-compose down          # Stop and remove
docker-compose down -v       # Also remove volumes
docker-compose down --remove-orphans
```

### Remove Images
```bash
docker rmi wagging-orchestrator:latest
docker image prune            # Remove unused images
```

### Deep Clean
```bash
docker system prune -a        # Remove all unused resources
docker volume prune           # Remove unused volumes
docker network prune          # Remove unused networks
```

---

## Kubernetes Preparation (STAGE 4)

The Docker image is now ready for Kubernetes deployment:

✅ **Health checks** - Readiness/liveness probes configured  
✅ **Resource limits** - Memory/CPU constraints defined  
✅ **Non-root user** - Security best practice  
✅ **Environment variables** - Externalized configuration  
✅ **Logging** - Structured output to stdout  
✅ **Signals** - Proper SIGTERM handling  

**Next: STAGE 4 will create:**
- Kubernetes Deployment manifest (40+ replicas)
- Service discovery (LoadBalancer/ClusterIP)
- Ingress for external access
- Horizontal Pod Autoscaler (HPA)
- ConfigMap/Secrets for configuration
- StatefulSet for databases

---

## Quick Reference

```bash
# Build
docker-compose build
docker build -t wagging-orchestrator:latest .

# Run
docker-compose up -d
docker run -p 3000:3000 wagging-orchestrator

# Monitor
docker-compose ps
docker-compose logs -f orchestrator
docker stats

# Test
curl http://localhost:3000/health
curl http://localhost:3000/api/agents

# Stop
docker-compose stop
docker-compose down

# Clean
docker system prune -a
```

---

## Completion Checklist

- [x] Dockerfile created (multi-stage, production-ready)
- [x] docker-compose.yml (6 services with monitoring)
- [x] .dockerignore (optimized build context)
- [x] Health checks configured
- [x] Non-root user security
- [x] Resource limits defined
- [x] Environment variables documented
- [x] Networking configured
- [x] Monitoring integrated (Prometheus + Grafana)
- [x] Troubleshooting guide included
- [x] Production deployment patterns documented

**Status:** ✅ STAGE 3 COMPLETE - Ready for Kubernetes deployment (STAGE 4)
