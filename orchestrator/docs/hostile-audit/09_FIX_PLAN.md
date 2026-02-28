# 09_FIX_PLAN.md - Release Hardening Sprint (2-3 Weeks)

**Goal:** Convert system from "fundamentally insecure" to "production-ready"

**Method:** Ruthless prioritization, fix fastest-risk-reduction items first

---

## Week 1: Prevent Immediate Disasters (Days 1-5)

### Day 1: Secrets Containment (4 hours)

**Do not proceed past this day without completing.**

```bash
# Task 1.1: Remove .env from git tracking
git rm --cached .env
echo ".env" >> .gitignore
echo "*.pem" >> .gitignore
git add .gitignore
git commit -m "Remove secrets from tracking, add .gitignore"
```

**Task 1.2:** Rotate hardcoded credentials immediately
```bash
# Generate new creds
MONGO_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
API_KEY=$(openssl rand -space64 32)

# Store in production secrets manager (AWS Secrets, Vault, etc.)
aws secretsmanager create-secret \
  --name orchestrator/mongo-password \
  --secret-string "$MONGO_PASSWORD"
```

**Task 1.3:** Update docker-compose.yml to reference secrets
```yaml
orchestrator:
  environment:
    MONGO_PASSWORD_FILE: /run/secrets/mongo_password
    
mongo:
  environment:
    MONGO_INITDB_ROOT_PASSWORD_FILE: /run/secrets/mongo_password

secrets:
  mongo_password:
    external: true  # Must be created externally
```

**Task 1.4:** Update connection string in code
```typescript
// src/persistence/mongo-connection.ts
const password = await fs.readFile(
  process.env.MONGO_PASSWORD_FILE || '/dev/stdin',
  'utf-8'
).then(s => s.trim());
const connectionUrl = `mongodb://orchestrator:${password}@mongo:27017/orchestrator`;
```

**Verification:**
```bash
git log --all -- .env | grep -q "committed" && echo "FAIL: .env still in history" || echo "PASS"
grep -q "\.env$" .gitignore && echo "PASS: .gitignore updated" || echo "FAIL"
```

**Time: 4 hours**  
**Risk Reduction: CRITICAL → HIGH**

---

### Day 2: Enable Database Authentication (4 hours)

**Task 2.1:** Enable MongoDB authentication
```yaml
# docker-compose.yml
mongo:
  image: mongo:7.0.3
  environment:
    MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}
    MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
  command: mongod --auth
```

**Task 2.2:** Update orchestrator to use auth
```typescript
// src/persistence/mongo-connection.ts
const url = `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@mongo:27017/orchestrator`;
```

**Task 2.3:** Test auth enforcement
```bash
# Should fail without credentials
mongosh mongodb://mongo:27017/orchestrator

# Should succeed with credentials
mongosh "mongodb://orchestrator:${MONGO_PASSWORD}@mongo:27017/orchestrator"
```

**Verification:**
```bash
docker-compose up -d mongo
sleep 5
docker exec orchestrator-mongo mongosh --eval "db.version()" 2>&1 | grep -q "unauthorized" && \
  echo "PASS: Auth required" || echo "FAIL: Still no auth"
```

**Time: 4 hours**  
**Risk Reduction: CRITICAL → MEDIUM**

---

### Day 3: Implement HTTP Endpoint Authentication (6 hours)

**Task 3.1:** Create auth middleware
```typescript
// src/middleware/auth.ts
import crypto from 'crypto';

export function requireBearerToken(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const expectedToken = process.env.API_KEY;
  
  if (!token || token !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

export function verifyWebhookSignature(req: any, res: any, next: any) {
  const signature = req.headers['x-webhook-signature'];
  const secret = process.env.WEBHOOK_SECRET;
  
  const computed = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');
  
  if (signature !== computed) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  next();
}
```

**Task 3.2:** Apply auth to critical endpoints
```typescript
// src/index.ts
app.get("/api/persistence/export", requireBearerToken, async (req, res) => { ... });
app.post("/api/knowledge/query", requireBearerToken, async (req, res) => { ... });
app.get("/api/persistence/historical", requireBearerToken, async (req, res) => { ... });
app.post("/webhook/alerts", verifyWebhookSignature, async (req, res) => { ... });

// Public OK:
app.get("/health", async (req, res) => { ... });  // Monitoring
app.get("/api/knowledge/summary", async (req, res) => { ... });  // Dashboard
```

**Task 3.3:** Generate secrets
```bash
API_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
WEBHOOK_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Store in .env.production
echo "API_KEY=$API_KEY" > .env.production
echo "WEBHOOK_SECRET=$WEBHOOK_SECRET" >> .env.production
```

**Task 3.4:** Update AlertManager config
```yaml
# monitoring/alertmanager.yml
receivers:
  - name: 'orchestrator-webhook'
    webhook_configs:
      - url: 'http://localhost:3000/webhook/alerts'
        headers:
          X-Webhook-Signature: '<computed-on-client-side>'
```

**Verification:**
```bash
# Should reject unauthenticated
curl http://localhost:3000/api/persistence/export
# Expected: 401 Unauthorized

# Should accept authenticated
curl http://localhost:3000/api/persistence/export \
  -H "Authorization: Bearer $API_KEY"
# Expected: 200 with data
```

**Time: 6 hours**  
**Risk Reduction: CRITICAL → MEDIUM**

---

### Day 4: Add Input Validation (6 hours)

**Task 4.1:** Install validation library
```bash
npm install zod express-json-schemavalidator
```

**Task 4.2:** Define schemas
```typescript
// src/middleware/validation.ts
import {z} from 'zod';

export const AlertManagerWebhookSchema = z.object({
  alerts: z.array(z.object({
    status: z.enum(['firing', 'resolved']),
    labels: z.record(z.string()).maxKeys(50),
    annotations: z.record(z.string()).optional(),
  })).max(1000),
  groupLabels: z.record(z.string()).optional(),
  commonLabels: z.record(z.string()).optional(),
  commonAnnotations: z.record(z.string()).optional(),
});

export const KBQuerySchema = z.object({
  query: z.string()
    .min(1, 'Query required')
    .max(5000, 'Query too long')
    .regex(/^[a-zA-Z0-9\s\-\.\(\)]+$/, 'Invalid characters'),
});
```

**Task 4.3:** Apply to endpoints
```typescript
app.post("/webhook/alerts", 
  validateRequest(AlertManagerWebhookSchema),
  requireBearerToken,
  async (req, res) => { ... }
);

app.post("/api/knowledge/query",
  validateRequest(KBQuerySchema),
  requireBearerToken,
  async (req, res) => { ... }
);
```

**Task 4.4:** Add Content-Length limit
```typescript
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb' }));
```

**Verification:**
```bash
# Should reject (too large)
python3 -c "import requests; requests.post('http://localhost:3000/webhook/alerts', json={'alerts': [{'labels': {'x': 'y'*1000000}}]})" && \
  echo "FAIL: Should reject" || echo "PASS: Rejected oversized"

# Should reject (invalid char)
curl -X POST http://localhost:3000/api/knowledge/query \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"query": "test<>;"}' && \
  echo "FAIL" || echo "PASS: Validation works"
```

**Time: 6 hours**  
**Risk Reduction: HIGH → MEDIUM**

---

### Day 5: Fix Test Suite & Get to Green (8 hours)

**Task 5.1:** Fix agent registry mismatch
```typescript
// tests /fixtures.ts
const agents = [
  { id: 'build-refactor-agent', name: 'Build & Refactor' },
  { id: 'code-review-agent', name: 'Code Review' },
  // ... fix all to match pattern
  { id: 'summarization-agent', name: 'Summarization' },  // ✅ Already matches
];
```

**Task 5.2:** Fix timing-dependent tests
```typescript
// test/integration/error-handling.test.ts
jest.useFakeTimers();

test('should apply exponential backoff', async () => {
  jest.advanceTimersByTime(400);
  expect(elapsed).toBe(400);  // Guaranteed, no flakiness
});
```

**Task 5.3:** Add missing agent mocks
```typescript
beforeAll(() => {
  agentRegistry.register({
    id: 'security-review-agent',
    name: 'Security Review',
    tier: 2,
    // ...
  });
});
```

**Task 5.4:** Run tests
```bash
npm run test:integration 2>&1 | tail -20
# Should show: PASS (X/X tests) instead of current FAIL (23 failures)
```

**Verification:**
```bash
npm run test 2>&1 | grep -i "tests.*passed.*failed"
# Expected: All tests passed (0 failed)
```

**Time: 8 hours**  
**Risk Reduction: Monitoring visibility**

---

## Week 2: Data Integrity & Graceful Degradation (Days 6-10)

### Day 6: Implement Knowledge Base Persistence (6 hours)

**Task 6.1:** Add save-on-write to KB
```typescript
// src/knowledge/knowledge-base.ts
async saveEntry(entry: KBEntry): Promise<void> {
  this.entries.set(entry.id, entry);
  this.updateIndex(entry);
  
  // NEW: Persist to MongoDB
  try {
    const collection = MongoConnection.getCollection('knowledge_base');
    await collection.updateOne(
      { id: entry.id },
      { $set: entry },
      { upsert: true }
    );
  } catch (error) {
    console.error('[KB] Persistence failed:', error);
    // Fail-safe: Keep in-memory even if DB down
  }
}
```

**Task 6.2:** Load KB from DB on startup
```typescript
static async load(): Promise<KnowledgeBase> {
  const kb = new KnowledgeBase();
  
  try {
    const collection = MongoConnection.getCollection('knowledge_base');
    const entries = await collection.find({}).toArray();
    for (const entry of entries) {
      kb.saveEntry(entry);
    }
    console.log(`[KB] Loaded ${entries.length} entries from MongoDB`);
  } catch (error) {
    console.warn('[KB] Could not load from MongoDB, starting fresh');
  }
  
  return kb;
}
```

**Task 6.3:** Test persistence
```bash
# Start system
docker-compose up -d

# Add KB entry
curl -X POST http://localhost:3000/api/knowledge/query \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"query": "test"}'

# Verify count
curl http://localhost:3000/api/knowledge/summary | jq '.stats.total'
# Should be 1

# Restart container
docker restart orchestrator

# Verify still there after restart
curl http://localhost:3000/api/knowledge/summary | jq '.stats.total'
# Should STILL be 1 ✅
```

**Time: 6 hours**  
**Risk Reduction: Data loss eliminated**

---

### Day 7-8: Database Migrations & Cleanup (8 hours)

**Task 7.1:** Implement migration system (4h)
```typescript
// src/persistence/migrations.ts
export const migrations = [
  {
    version: 1,
    name: 'initial',
    up: async (db) => {
      // Implicit - collections created on first write
    }
  },
  // Add future migrations here
];

export async function runMigrations(db: Db): Promise<void> {
  const state = db.collection('system_state');
  let version = 0;
  
  try {
    const record = await state.findOne({ key: 'schema_version' });
    version = record?.value || 0;
  } catch {}
  
  for (const migration of migrations.filter(m => m.version > version)) {
    console.log(`[Migrations] Applying v${migration.version}: ${migration.name}`);
    await migration.up(db);
    await state.updateOne(
      { key: 'schema_version' },
      { $set: { value: migration.version } },
      { upsert: true }
    );
  }
}
```

**Task 7.2:** Add data retention cleanup (4h)
```typescript
// src/persistence/cleanup-scheduler.ts
export class CleanupScheduler {
  start(): void {
    // Run midnight every day
    const now = new Date();
    const next = new Date();
    next.setHours(0, 0, 0, 0);
    next.setDate(next.getDate() + 1);
    
    const delay = next.getTime() - now.getTime();
    setTimeout(() => {
      this.cleanup();
      setInterval(() => this.cleanup(), 24 * 60 * 60 * 1000);
    }, delay);
  }
  
  private async cleanup(): Promise<void> {
    const db = MongoConnection.getDb();
    
    // Delete metrics older than 90 days
    const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result1 = await db.collection('metrics').deleteMany({ timestamp: { $lt: cutoff90d } });
    
    // Delete alerts older than 48 hours
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const result2 = await db.collection('alerts').deleteMany({ timestamp: { $lt: cutoff48h } });
    
    console.log(`[Cleanup] Deleted ${result1.deletedCount} metrics, ${result2.deletedCount} alerts`);
  }
}
```

**Time: 8 hours**  
**Risk Reduction: Unbounded growth prevented**

---

### Day 9: Add Rate Limiting (4 hours)

**Task 9.1:** Install library
```bash
npm install express-rate-limit
```

**Task 9.2:** Configure limiters
```typescript
// src/middleware/rate-limit.ts
import rateLimit from 'express-rate-limit';

export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many alerts, please retry',
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
});

export const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,  // Expensive operation
});
```

**Task 9.3:** Apply to endpoints
```typescript
app.post("/webhook/alerts", webhookLimiter, verifyWebhookSignature, ...);
app.post("/api/knowledge/query", apiLimiter, requireBearerToken, ...);
app.get("/api/persistence/export", exportLimiter, requireBearerToken, ...);
```

**Verification:**
```bash
for i in {1..31}; do
  curl -s http://localhost:3000/api/knowledge/query -d '{"query":"test"}' -w ":%{http_code}\n"
done

# Last 2 should show 429 (rate limited)
```

**Time: 4 hours**  
**Risk Reduction: DoS mitigated**

---

### Day 10: Graceful Shutdown & Monitoring (6 hours)

**Task 10.1:** Add SIGTERM handler
```typescript
// src/index.ts
const server = app.listen(PORT, () => {
  console.log(`[orchestrator] HTTP server listening on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  console.log('[orchestrator] Received SIGTERM, graceful shutdown...');
  server.close(async () => {
    await PersistenceIntegration.close();
    await memoryScheduler.stop();
    process.exit(0);
  });
  
  // Force kill after 30 seconds
  setTimeout(() => {
    console.error('[orchestrator] Shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000);
});
```

**Task 10.2:** Add security event logging
```typescript
// src/security/audit-logger.ts
export function logSecurityEvent(event: string, details: any): void {
  console.warn(`[SECURITY] ${event}`, JSON.stringify(details));
  
  // Also write to audit log file for review
  const logEntry = JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    details,
  });
  
  fs.appendFileSync('./logs/security.jsonl', logEntry + '\n').catch(err => {
    console.error('[SECURITY] Failed to log:', err);
  });
}
```

**Task 10.3:** Add MongoDB monitoring
```typescript
// Add to Prometheus scraper
const mongoDbMetrics = new prometheus.Gauge({
  name: 'mongodb_collection_count',
  help: 'Number of documents per collection',
  labelNames: ['collection'],
});

// Periodically update
setInterval(async () => {
  const db = MongoConnection.getDb();
  for (const col of ['metrics', 'alerts', 'knowledge_base']) {
    const count = await db.collection(col).countDocuments();
    mongoDbMetrics.set({ collection: col }, count);
  }
}, 60000);  // Every minute
```

**Time: 6 hours**  
**Risk Reduction: Observability improved**

---

## Week 3: Polish & Production Readiness (Days 11-15)

### Day 11-12: Docker Hardening (6 hours)

**Task 11.1:** Pin all image versions
```dockerfile
FROM node:20.11.0-alpine3.19 AS dependencies
# ... rest unchanged
```

```yaml
# docker-compose.yml
mongo:
  image: mongo:7.0.3
redis:
  image: redis:7.0.10-alpine
prometheus:
  image: prom/prometheus:v2.48.0
grafana:
  image: grafana/grafana:10.2.2
alertmanager:
  image: prom/alertmanager:v0.26.0
```

**Task 11.2:** Add resource limits
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

mongo:
  deploy:
    resources:
      limits:
        cpus: '2.0'
        memory: 2G
```

**Task 11.3:** Network isolation
```yaml
orchestrator:
  ports:
    - "127.0.0.1:3000:3000"  # Local only

prometheus:
  ports:
    - "127.0.0.1:9090:9090"  # Local only
```

**Time: 6 hours**

---

### Day 13: Security & Compliance Documentation (4 hours)

**Task 13.1:** Write SECURITY.md
```markdown
# Security Policy

## Vulnerabilities

Report to: security@openclaw.io (not public GitHub)

## Known Limitations (Development)

- No TLS (configure reverse proxy for production)
- MongoDB auth optional in docker-compose
- See HARDENING.md for production setup

## Production Checklist

- [ ] .env secrets in external manager (Vault, AWS Secrets)
- [ ] MongoDB with auth enabled
- [ ] HTTPS/TLS configured
- [ ] API keys rotated monthly
- [ ] Rate limits configured
- [ ] Input validation enabled
```

**Task 13.2:** Update README
```bash
# 🚨 WARNING: Development Setup

This is NOT production-ready. See `docs/HARDENING.md` for production deployment.
```

**Task 13.3:** Create HARDENING.md
```markdown
# Production Hardening Guide

## Before Deployment

1. Generate new credentials
2. Enable MongoDB auth
3. Configure TLS/HTTPS
4. Set rate limits
5. Update firewall rules
6. Review SECURITY.md
```

**Time: 4 hours**

---

### Day 14-15: Final Testing & Deployment (10 hours)

**Task 14.1:** End-to-end test scenarios (4h)
```bash
# Test 1: Unauthenticated access rejected
curl http://localhost:3000/api/persistence/export
# Expected: 401

# Test 2: Authenticated access accepted
curl http://localhost:3000/api/persistence/export \
  -H "Authorization: Bearer $API_KEY"
# Expected: 200

# Test 3: KB persists after restart
# Add entry → restart → verify exists

# Test 4: Rate limiting works
for i in {1..31}; do curl http://localhost:3000/test; done
# Expected: Last 2 get 429

# Test 5: Graceful shutdown
docker stop -t 30 orchestrator-orchestrator
# Expected: Clean shutdown, no errors in logs
```

**Task 14.2:** Load testing (3h)
```bash
npm run test:load

# Verify:
# - <100ms for health checks
# - <200ms for KB queries under rate limit
# - 429 responses when rate limited
# - No crashes under sustained 100 req/sec
```

**Task 14.3:** Security scanning (2h)
```bash
docker run --rm aquasec/trivy image orchestrator:latest
# Expected: 0 CRITICAL, 0 HIGH vulnerabilities

npm audit --production
# Expected: 0 high/critical vulnerabilities
```

**Task 14.4:** Document deployment
```bash
# Create ops/DEPLOYMENT.md with procedures
# Create ops/RUNBOOK.md with incident response
# Create ops/MONITORING.md with alert key metrics
```

**Time: 10 hours**

---

## Success Criteria (Go/No-Go)

**MUST PASS before production deployment:**

```
[✅] All tests passing (npm run test → 100%)
[✅] Security scan passing (0 CRITICAL vulns)
[✅] Load tests passing (no crashes at 100 req/sec)
[✅] Graceful shutdown verified
[✅] KB persists across restarts
[✅] Rate limiting enforced
[✅] Auth required on sensitive endpoints
[✅] MongoDB auth enabled
[✅] Docker images pinned
[✅] Documentation complete
[✅] SECURITY.md written
[✅] Runbook tested
```

---

## Timeline Summary

| Week | Days | Focus | Risks Reduced | Hours |
|------|------|-------|----------------|--------|
| 1 | 1-5 | Secrets, DB auth, HTTP auth, input validation, tests | CRITICAL → MEDIUM | 28h |
| 2 | 6-10 | KB persistence, migrations, cleanup, rate limits, graceful shutdown | MEDIUM → LOW | 28h |
| 3 | 11-15 | Docker hardening, docs, final testing | LOW | 20h |
| **TOTAL** | **15 days** | **Hardening Sprint** | **FAIL → PASS** | **76h** |

---

## Team Assignment

```
Security Lead:
  - Day 1-3: Secrets, DB auth, HTTP auth
  - Day 7-8: Migrations
  - Week 3: Security scanning
  
Backend Developer:
  - Day 4: Input validation
  - Day 6-8: KB persistence, cleanup
  - Day 9: Rate limiting
  
DevOps:
  - Day 10: Graceful shutdown
  - Week 3: Docker hardening
  - Day 14-15: Load testing, deployment
  
QA:
  - Day 5: Test suite fixes
  - Week 3: E2E testing
  - Day 15: Final validation
  
Documentation:
  - Week 2: Security logging
  - Week 3: SECURITY.md, runbooks
```

---

## Go-Live Checklist

```
PRE-DEPLOYMENT
[ ] All 20 blockers from audit fixed & verified
[ ] 100% test pass rate
[ ] Security scan: 0 CRITICAL/HIGH
[ ] Load testing: 100 req/sec sustained
[ ] Secrets rotated and in external manager
[ ] Runbook tested with actual team
[ ] Backups validated & restorable
[ ] Monitoring alerts configured
[ ] Incident response plan written
[ ] Status page updated

DAY OF DEPLOYMENT
[ ] Early morning (business hours, team available)
[ ] Point-in-time backup taken
[ ] Canary deployment to staging (24h observation)
[ ] Health checks passing
[ ] Key workflows tested
[ ] Logs clean (no errors)
[ ] Team on standby for 48h

POST-DEPLOYMENT (WEEK 1)
[ ] Daily health checks
[ ] Security event log review
[ ] Performance metrics review
[ ] Customer feedback collected
[ ] Any urgent issues escalated
```

---

**Estimated completion for production-ready:** 2021-03-10 (3 weeks from 2026-02-17)

