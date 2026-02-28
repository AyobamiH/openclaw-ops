# 08_DOCKER_AND_RELEASE_TRUTH.md - Container Security & Build Reproducibility

---

## Docker Build Reproducibility

### Issue 1: Base Image Not Pinned

**Evidence:**
```dockerfile
# Line 8, 27, 38
FROM node:20-alpine AS dependencies
FROM node:20-alpine AS builder
FROM node:20-alpine
```

**Problem:** `:20-alpine` resolves to latest 20.x tag weekly
- Apr 2025: node:20.10.0
- May 2025: node:20.11.0 (might have breaking changes)
- Build on Monday ≠ Build on Friday (different Node version)

**Fix:**
```dockerfile
FROM node:20.11.0-alpine3.19  # Exact pin
```

### Issue 2: Dependencies Not Pinned in Dockerfile

**Evidence:**
```dockerfile
RUN apk add --no-cache curl dumb-init
```

**Problem:** Alpine updates libc/curl weekly, versions not pinned

**Fix:**
```dockerfile
RUN apk add --no-cache --exact \
  curl=8.5.0-r1 \
  dumb-init=1.2.5-r1
```

### Issue 3: npm install in Docker (Dev + Prod Deps)

**Risk:** In some CI cases, `npm install` might install different transitive versions than `npm ci` with lock file

**Fix:** Use `npm ci` instead:
```dockerfile
RUN npm ci --only=production  # Respects package-lock.json exactly
```

---

## Container Runtime Security

### ✅ What's Good

- Non-root user: `USER orchestrator` (uid 1001)
- dumb-init: Signal handling works correctly
- Health checks: HEALTHCHECK defined
- Read-only expected: Most of filesystem read-only

### ❌ What's Missing

**Issue 1: No Read-Only Root Filesystem**

```dockerfile
# Current: No read-only option
```

**Fix:**
```yaml
# docker-compose.yml
orchestrator:
  read_only: true
  tmpfs:
    - /app/logs
    - /app/data
    - /tmp
```

**Issue 2: No Resource Limits**

**Current:** Container can use unlimited memory/CPU
- Runaway process → OOM kills container
- No gradual degradation

**Fix:**
```yaml
orchestrator:
  deploy:
    resources:
      limits:
        cpus: '1.0'
        memory: 1G
      reservations:
        cpus: '0.5'
        memory: 512M
```

**Issue 3: No Security Context**

**Fix (for Kubernetes):**
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1001
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL
```

---

## Docker Compose Issues

### Issue 1: Image Versions Not Pinned

**Current:**
```yaml
mongo:
  image: mongo:latest          # ❌ Latest tag
redis:
  image: redis:7-alpine        # ❌ 7.x.x
prometheus:
  image: prom/prometheus:latest  # ❌ Latest
```

**Fix:**
```yaml
mongo:
  image: mongo:7.0.3
redis:
  image: redis:7.0.10-alpine
prometheus:
  image: prom/prometheus:v2.48.0
grafana:
  image: grafana/grafana:10.2.2
```

### Issue 2: Default Passwords Exposed

**Current:**
```yaml
grafana:
  environment:
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}
```

**Problem:** If `GRAFANA_PASSWORD` not set, defaults to `admin` (world-readable in docker-compose.yml)

**Fix:**
```yaml
grafana:
  environment:
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}  # No default, REQUIRED
```

Update .env:
```env
GRAFANA_PASSWORD=<generate-strong-password>
```

### Issue 3: Environment Variables in Compose (Potential Secret Leak)

**Current:**
```yaml
orchestrator:
  environment:
    OPENAI_API_KEY: ${OPENAI_API_KEY}       # Shows up in `docker inspect`
    ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
```

**Problem:** After container starts, `docker inspect` shows all env vars in plaintext

**Fix:** Use secrets (Docker Swarm) or secret files:
```yaml
orchestrator:
  secrets:
    - openai_api_key
  environment:
    OPENAI_API_KEY_FILE: /run/secrets/openai_api_key

secrets:
  openai_api_key:
    external: true  # Load from outside (e.g., HashiCorp Vault)
```

Implementation in code:
```typescript
const apiKey = await fs.readFile(process.env.OPENAI_API_KEY_FILE, 'utf-8');
```

### Issue 4: Network Exposure

**Current:**
```yaml
orchestrator:
  ports:
    - "3000:3000"  # Exposes to all interfaces (0.0.0.0:3000)
prometheus:
  ports:
    - "9090:9090"  # Prometheus exposed publicly
```

**Risk:** Prometheus exposed on public internet → scrape metrics, learn about alerts

**Fix:**
```yaml
orchestrator:
  ports:
    - "127.0.0.1:3000:3000"  # Only localhost
  networks:
    - orchestrator-net      # Internal network only

prometheus:
  ports:
    - "127.0.0.1:9090:9090"  # Only internal
  networks:
    - orchestrator-net
```

### Issue 5: No Restart Policy Specified

**Current:**
```yaml
orchestrator:
  restart: unless-stopped
```

**Problem:** Container auto-restarts, hiding underlying issue until deployed to Kubernetes (different restart behavior)

**Current Policy is OK for docker-compose, but needs alerting:**
```yaml
orchestrator:
  restart: unless-stopped
  # Add health check alert (separate tooling needed)
```

---

## Production Readiness Checklist

### Image Scanning

**Issue:** No container image scanning before deployment

**Fix:**
```bash
# Add to CI/CD:
docker build -t orchestrator:latest .

# Scan with Trivy
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image \
  --severity HIGH,CRITICAL \
  orchestrator:latest

# Scan with Grype
curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh
./grype orchestrator:latest --db-dir grype.db
```

**GATE: MUST have 0 CRITICAL vulnerabilities**

### Vulnerability Check

**Current dependencies:**
```json
{
  "express": "^4.22.0",
  "mongodb": "^6.0.0",
  "node-cron": "^3.0.2"
}
```

**Known CVEs:**
- `node-cron` v3.0.0-3.0.2: Remote code execution via timezone field
  - Fix: Update to v3.0.3+

**Required:**
```bash
npm audit --production --severity=high  # Must pass
```

---

## Deployment Validation

### Pre-Deployment Checklist

```bash
#!/bin/bash

# 1. Image scan
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image orchestrator:latest \
  --severity HIGH,CRITICAL \
  --exit-code 1  # Exit non-zero if findings

# 2. Build test
docker build -t orchestrator:test .

# 3. Start containers
docker compose up -d

# 4. Health check
for i in {1..30}; do
  curl http://localhost:3000/health && break
  sleep 1
done

# 5. Smoke tests
curl -X POST http://localhost:3000/api/knowledge/query \
  -d '{"query": "test"}' \
  -H "Authorization: Bearer $API_KEY"

# 6. Log inspection
docker logs orchestrator | grep CRITICAL || echo "✅ No critical errors"

# 7. Resource check
docker stats --no-stream | grep orchestrator
```

---

## Production Hardening Requirements

**Must do before production deployment:**

| Requirement | Current | Required | Risk |
|-------------|---------|----------|------|
| Image pinning | ❌ | ✅ | Reproducibility |
| Base image hardening | ⚠️ | ✅ | Security |
| Resource limits | ❌ | ✅ | DoS |
| Network isolation | ❌ | ✅ | Exposure |
| Secrets management | ❌ | ✅ | Disclosure |
| Health checks | ✅ | ✅ | Monitoring |
| Non-root user | ✅ | ✅ | Security |
| Image scanning | ❌ | ✅ | Vulnerabilities |

---

## Container Failure Scenarios

### Scenario 1: MongoDB Unavailable

**Current:** Orchestrator starts, writes silently fail

**Required:** Startup fails, error logged, manual intervention needed

### Scenario 2: Redis Unavailable

**Current:** No Redis usage yet (ready but not connected)

**Required:** Eventually when Redis used, hard startup failure

### Scenario 3: Port 3000 Already Bound

**Current:** Docker fails to start (port conflict)

**Required:** This is correct behavior (fail-fast)

---

## Open-Source Release Safety

**If plan to make repo public, must fix:**

1. ✅ Remove .env from git (already done via audit)
2. ✅ Remove API keys from commit history
3. ✅ Add CODE_OF_CONDUCT.md
4. ✅ Add SECURITY.md (responsible disclosure)
5. ✅ Add CONTRIBUTING.md
6. ✅ Update README with "NOT FOR PRODUCTION" warning
7. ✅ License change (if needed - currently MIT-like)

**Example SECURITY.md:**
```markdown
# Security Policy

## Reporting Vulnerabilities

DO NOT open public GitHub issues for security vulnerabilities.

Email: security@openclaw.io

## Known Limitations

- MongoDB runs without authentication in docker-compose dev setup
- HTTP only (no TLS in base configuration)
- No authentication on HTTP endpoints (base setup)

See docs/SECURITY.md for hardening steps.
```

---

## Summary

**Docker & Release Readiness:** 🔴 **NOT READY**

| Category | Status | Blockers |
|----------|--------|----------|
| Image pinning | ❌ | All versions must be pinned |
| Security context | ❌ | No non-root, no resource limits |
| Secrets management | ❌ | Hardcoded defaults |
| Network isolation | ❌ | Exposed on 0.0.0.0 |
| Scanning | ❌ | No pre-deployment scan |
| Reproducibility | ❌ | Latest tags, unpinned deps |

**Time to fix:** 4-6 hours

**Cannot deploy to production until:**
- [ ] All image versions pinned
- [ ] Resource limits added
- [ ] Network isolated
- [ ] Image scanning PASSES (0 CRITICAL vulns)
- [ ] Secrets moved to external manager
- [ ] SECURITY.md written
- [ ] README updated with warnings
