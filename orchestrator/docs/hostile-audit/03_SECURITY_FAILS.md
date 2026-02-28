# 03_SECURITY_FAILS.md - Detailed Vulnerability Analysis

**Format:** Finding / Evidence / Impact / Minimal Fix / Verification

---

## Category: Secrets Management

### FINDING: Hardcoded Database Credentials in .env

**Severity:** 🔴 CRITICAL  
**CWE:** CWE-798 (Use of Hard-Coded Credentials)  
**CVSS Score:** 9.1 (Critical)

**Evidence:**
```env
# File: .env (line 26-27)
DATABASE_URL=mongodb://orchestrator:orchestrator-dev@mongo:27017/orchestrator
MONGO_PASSWORD=orchestrator-dev
REDIS_PASSWORD=orchestrator-dev
```

**File Locations:**
- `.env` (tracked in git, not in .gitignore)
- `docker-compose.yml` (line 22: references `${REDIS_PASSWORD:-orchestrator-dev}`)

**Exploit Scenario:**
1. Attacker clones public repo
2. Extracts `.env` from git history: `git show HEAD:.env`
3. Connects directly: `mongosh "mongodb://orchestrator:orchestrator-dev@prod.example.com:27017/orchestrator"`
4. Full read/write access to production database

**Impact:**
- ✅ Database compromise (read all metrics, alerts, KB)
- ✅ Data manipulation (inject fake metrics into dashboards)
- ✅ Denial of service (drop all collections)
- ✅ Lateral movement (use DB as pivot point)

**Minimal Fix (2 steps):**

1. Add to `.gitignore`:
```ini
# Secrets
.env
.env.*.local
*.pem
.secrets/
```

2. Remove from git history:
```bash
git rm --cached .env
git commit -m "Remove .env from tracking"
# For full removal from history:
git filter-branch --tree-filter 'rm -f .env' HEAD
```

3. Use environment-based secrets instead:
```typescript
// src/config.ts
const dbPassword = process.env.MONGO_PASSWORD;
if (!dbPassword) throw new Error('MONGO_PASSWORD required');
```

**Verification:**
```bash
# Verify .env not tracked
git status .env  # Should show "nothing to commit"

# Verify no secrets in committed files
git grep "orchestrator-dev"  # Should return NOTHING
```

---

### FINDING: SendGrid API Key Template Not Populated

**Severity:** 🟡 MEDIUM (currently unexploited, but template suggests misunderstanding)  
**CWE:** CWE-798

**Evidence:**
```env
# .env (line 10)
SENDGRID_API_KEY=${SENDGRID_API_KEY}
```

**Analysis:**
- Variable is template (not hardcoded), but `.env` should NOT contain template
- `.env` should only exist with real secrets in production
- DevOps team must populate via CI/CD or secrets manager
- Risk: Developer commits `.env` with templates, someone later auto-populates

**Minimal Fix:**
```bash
# Instead of .env, use .env.example for templates
mv .env .env.develop  # Keep for local development
create .env.example   # Track in git with templates
```

---

### FINDING: .env File Tracked in Git Without .gitignore

**Severity:** 🔴 CRITICAL  
**CWE:** CWE-798

**Evidence:**
```bash
$ grep -F ".env" .gitignore
# No output - .env is NOT in .gitignore

$ git status .env
# On branch master     # Clean working tree (tracked!)
```

**Impact:**
- Anyone with git access sees all secrets
- Secrets in CI/CD logs (GitHub Actions, GitLab CI, Jenkins)
- Accidental exposure if repo made public
- Permanent history (can't delete without `git filter-branch`)

**Minimal Fix:**
```bash
# 1. Add .gitignore entry
echo ".env" >> .gitignore
echo ".env.*.local" >> .gitignore
echo "*.pem" >> .gitignore

# 2. Remove from tracking
git rm --cached .env
git commit -m "Remove .env secrets from tracking"

# 3. Verify
git status  # Should show .env in untracked
```

**Verification:**
```bash
git log --oneline --all -- .env | wc -l  # Should be 0 after filter
```

---

## Category: Authentication & Authorization

### FINDING: No Authentication on Any HTTP Endpoints

**Severity:** 🔴 CRITICAL  
**CWE:** CWE-306 (Missing Authentication for Critical Function)  
**CVSS:** 9.1 (Critical)

**Evidence:**
```typescript
// src/index.ts (lines 189-270)

// ❌ No auth middleware
app.post("/webhook/alerts", async (req, res) => { ... });
app.get("/api/persistence/export", async (req, res) => { ... });
app.post("/api/knowledge/query", async (req, res) => { ... });
app.get("/api/persistence/historical", async (req, res) => { ... });

// No middleware like:
// app.use(authenticateToken);
// app.use(requireApiKey);
```

**Affected Endpoints:**
```
POST   /webhook/alerts                 ❌ Public
POST   /api/knowledge/query            ❌ Public
GET    /api/knowledge/summary          ❌ Public (acceptable)
GET    /api/knowledge/export           ❌ Public
GET    /api/persistence/health         ❌ Public (acceptable)
GET    /api/persistence/historical     ❌ Public
GET    /api/persistence/export         ❌ Public (CRITICAL)
GET    /health                         ❌ Public (acceptable)
```

**Exploit Scenarios:**

1. **Alert Injection:**
   ```bash
   curl -X POST http://localhost:3000/webhook/alerts \
     -H "Content-Type: application/json" \
     -d '{
       "alerts": [{
         "status": "firing",
         "labels": {"alertname": "CPU_CRITICAL", "severity": "critical"},
         "annotations": {"summary": "FAKE ALERT - SYSTEM FINE"}
       }]
     }'
   # Result: Fake alert sent to Slack, ops team distracted from real issues
   ```

2. **Database Export (Information Disclosure):**
   ```bash
   curl http://localhost:3000/api/persistence/export
   # Returns: Collection sizes, DB metadata → Reconnaissance data
   ```

3. **KB Pollution:**
   ```bash
   curl -X POST http://localhost:3000/api/knowledge/query \
     -H "Content-Type: application/json" \
     -d '{"query": "HACKED: Your system is compromised"}'
   # Although read-only, demonstrates unauth access
   ```

**Impact:**
- ✅ Unauthorized operations on critical systems
- ✅ Alert fatigue (ops team effectiveness reduced)
- ✅ Information disclosure (DB metadata, collection sizes)
- ✅ Lack of audit trail (who triggered what?)

**Minimal Fix (2 hours):**

1. Create auth middleware:
```typescript
// src/middleware/auth.ts
export function requireApiKey(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

export function requireWebhookSignature(req: any, res: any, next: any) {
  // For AlertManager: requires shared secret + HMAC-SHA256 signature
  // Prometheus doesn't natively sign, but custom header can be added in alert rules
  const signature = req.headers['x-webhook-signature'];
  const expected = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET || '')
    .update(JSON.stringify(req.body))
    .digest('hex');
  if (signature !== expected) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  next();
}
```

2. Apply middleware:
```typescript
app.post("/webhook/alerts", requireWebhookSignature, async (req, res) => { ... });
app.get("/api/persistence/export", requireApiKey, async (req, res) => { ... });
app.post("/api/knowledge/query", requireApiKey, async (req, res) => { ... });
// Public endpoints remain public
app.get("/health", async (req, res) => { ... });
```

3. Add to environment:
```env
API_KEY=your-secure-random-key-here-at-least-32-chars
WEBHOOK_SECRET=your-webhook-secret-at-least-32-chars
```

**Verification:**
```bash
# Should reject:
curl http://localhost:3000/api/persistence/export
# Expected: 401 Unauthorized

# Should accept:
curl http://localhost:3000/api/persistence/export \
  -H "Authorization: Bearer $API_KEY"
# Expected: 200 with data
```

---

### FINDING: MongoDB Running Without Authentication

**Severity:** 🔴 CRITICAL  
**CWE:** CWE-306 (Missing Authentication for Critical Function)  

**Evidence:**
```yaml
# docker-compose.yml (lines 49-50)
mongo:
  command: mongod --noauth
```

**Direct Access:**
```bash
mongosh mongodb://mongo:27017/orchestrator  # No credentials needed!
db.metrics.find().limit(1)                  # Full read access
db.knowledge_base.drop()                    # Full write access
```

**Impact:**
- ✅ Any network access = full DB access
- ✅ No audit trail of who accessed what
- ✅ No encryption in transit
- ✅ No role-based access control

**Minimal Fix:**

1. Update docker-compose:
```yaml
mongo:
  image: mongo:7.0.3
  environment:
    MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER:-admin}
    MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD:-$(openssl rand -base64 32)}
  command: mongod --auth
```

2. Update `.env`:
```env
MONGO_USER=orchestrator
MONGO_PASSWORD=<generate-strong-random-password>
```

3. Update connection string:
```typescript
// src/persistence/mongo-connection.ts
const connectionUrl = `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@mongo:27017/orchestrator`;
```

4. Rotate credentials after deployment:
```bash
docker exec orchestrator-mongo mongosh --eval "
  db.changeUserPassword('orchestrator', 'new-password-here')
"
```

**Verification:**
```bash
# This should fail with auth error:
mongosh mongodb://mongo:27017/orchestrator
# Expected: MongoServerError: command hello requires authentication

# This should succeed:
mongosh mongodb://orch estrator:password@mongo:27017/orchestrator
```

---

### FINDING: No Rate Limiting on Any Endpoint

**Severity:** 🔴 CRITICAL (enables DoS + credential brute force)  
**CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling)  

**Evidence:**
- No `express-rate-limit` middleware in index.ts
- No per-IP request counting
- No per-endpoint request limits
- No exponential backoff

**Exploit Scenario: Alert Flooding DoS**
```bash
# Attacker script
for i in {1..10000}; do
  curl -X POST http://localhost:3000/webhook/alerts \
    -d '{"alerts":[...]}' &
done

# Result: 
# - Memory exhaustion (10k pending requests in queue)
# - CPU maxed out processing alerts
# - Legitimate alerts lost (queue overflow)
# - Slack API calls pile up → backlog grows
```

**Minimal Fix (30 minutes):**

1. Install dependency:
```bash
npm install express-rate-limit
```

2. Add middleware:
```typescript
// src/middleware/rate-limit.ts
import rateLimit from 'express-rate-limit';

export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,          // 1 minute
  max: 100,                      // 100 requests per minute per IP
  message: 'Too many alerts, please try again later',
  standardHeaders: true,         // Return limit info in `RateLimit-*` headers
  legacyHeaders: false,          // Disable `X-RateLimit-*` headers
  keyGenerator: (req) => req.ip || 'unknown',
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,                      // 30 requests per minute per IP
});

export const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,                        // 5 exports per minute per IP (expensive!)
  skip: (req) => process.env.NODE_ENV !== 'production',
});
```

3. Apply limiters:
```typescript
// src/index.ts
app.post("/webhook/alerts", webhookLimiter, async (req, res) => { ... });
app.get("/api/persistence/export", exportLimiter, async (req, res) => { ... });
app.post("/api/knowledge/query", apiLimiter, async (req, res) => { ... });
```

**Verification:**
```bash
# Test: Hit endpoint 31 times
for i in {1..31}; do
  curl http://localhost:3000/api/knowledge/query -X POST -d '{"query":"test"}' -s -w "Status: %{http_code}\n"
done

# Expected: First 30 return 200, #31 returns 429 (Too Many Requests)
```

---

### FINDING: Default Grafana Password

**Severity:** 🔴 CRITICAL  
**CWE:** CWE-521 (Weak Password Requirements)  

**Evidence:**
```yaml
# docker-compose.yml (lines 130-131)
grafana:
  environment:
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}
```

**Exploit Scenario:**
```bash
# Default credentials
curl -u admin:admin http://localhost:3001/api/users/me
# Returns user data, confirms admin access
```

**Impact:**
- ✅ Full operational dashboard access
- ✅ Ability to create/delete dashboards
- ✅ Ability to modify alert rules
- ✅ Access to datasource config (Prometheus credentials)

**Minimal Fix:**
```yaml
grafana:
  environment:
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}  # No default!
```

```bash
# Generate strong password
export GRAFANA_PASSWORD=$(openssl rand -base64 32)
docker-compose up -d grafana
```

---

## Category: Input Validation

### FINDING: No Input Validation on POST /webhook/alerts

**Severity:** 🔴 CRITICAL  
**CWE:** CWE-20 (Improper Input Validation)  

**Evidence:**
```typescript
// src/index.ts (line 189)
app.post("/webhook/alerts", async (req, res) => {
  try {
    console.log("[webhook/alerts] Received alert from AlertManager");
    await alertHandler.handleAlertManagerWebhook(req.body);  // ❌ No schema validation
    res.json({ status: "ok" });
  } catch (error: any) {
    // ...
  }
});
```

**No Validation Of:**
- ❌ Payload size (unlimited)
- ❌ Array bounds (unlimited alert count)
- ❌ Field types (labels could be anything)
- ❌ String lengths (summary could be 1GB)
- ❌ Required fields (status, labels, annotations)

**Exploit Scenarios:**

1. **Payload Size Attack:**
   ```bash
   python3 -c "
   import requests, json
   big_payload = {
       'alerts': [{
         'status': 'firing',
         'labels': {'x': 'y' * 1000000000},  # 1GB of data
         'annotations': {}
       }]
   }
   requests.post('http://localhost:3000/webhook/alerts', json=big_payload)
   "
   # Result: OOM, service crash
   ```

2. **Type Confusion:**
   ```json
   {
     "alerts": "not an array"
   }
   ```
   Result: Code expects `for (const alert of payload.alerts)`, crashes on string

**Minimal Fix (1 hour):**

1. Add validation schema:
```typescript
// src/middleware/validation.ts
import { z } from 'zod';

const PrometheusAlertSchema = z.object({
  status: z.enum(['firing', 'resolved']),
  labels: z.record(z.string()).maxKeys(50),  // Max 50 label keys
  annotations: z.record(z.string()).optional(),
});

const AlertManagerWebhookSchema = z.object({
  alerts: z.array(PrometheusAlertSchema).max(1000),  // Max 1000 alerts
  groupLabels: z.record(z.string()).optional(),
  commonLabels: z.record(z.string()).optional(),
  commonAnnotations: z.record(z.string()).optional(),
});

export function validateAlertManagerRequest(req: any, res: any, next: any) {
  try {
    const parsed = AlertManagerWebhookSchema.parse(req.body);
    req.body = parsed;  // Replace with parsed/validated data
    next();
  } catch (error: any) {
    return res.status(400).json({ error: 'Invalid request: ' + error.message });
  }
}
```

2. Apply middleware:
```typescript
// src/index.ts
app.post("/webhook/alerts", validateAlertManagerRequest, async (req, res) => { ... });
```

3. Add Content-Length limit:
```typescript
app.use(express.json({ limit: '1mb' }));  // Max 1MB body
```

**Verification:**
```bash
# Should reject (too many alerts)
curl -X POST http://localhost:3000/webhook/alerts \
  -H "Content-Type: application/json" \
  -d '{"alerts": [' $(python3 -c "print('{\"status\":\"firing\"},' * 1001)") ']}'
# Expected: 400 Bad Request

# Should reject (invalid status)
curl -X POST http://localhost:3000/webhook/alerts \
  -d '{"alerts": [{"status": "invalid"}]}'
# Expected: 400 Bad Request

# Should accept:
curl -X POST http://localhost:3000/webhook/alerts \
  -d '{"alerts": [{"status": "firing", "labels": {}, "annotations": {}}]}'
# Expected: 200 ok
```

---

### FINDING: No Input Validation on /api/knowledge/query

**Severity:** 🔴 CRITICAL (for future MongoDB integration)  
**CWE:** CWE-943 (Improper Neutralization of Special Elements in Data Query Logic - NoSQL Injection)  

**Evidence:**
```typescript
// src/index.ts (line 202-210)
app.post("/api/knowledge/query", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {  // ❌ Only checks for empty string
      return res.status(400).json({ error: "query parameter required" });
    }
    
    const results = await knowledgeIntegration.queryAPI(query);  // ❌ No sanitization
    res.json(results);
  } catch (error: any) { ... }
});
```

**Current Risk:** LOW (in-memory search uses `.includes()`)  
**Future Risk:** CRITICAL (if code migrates KB to MongoDB with `$where` or `$regex`)

**Potential Injection:**
```json
{"query": "test'; db.knowledge_base.drop(); //"}
```

**Minimal Fix:**

1. Validate input:
```typescript
const QueryValidationSchema = z.object({
  query: z.string()
    .min(1, 'Query required')
    .max(5000, 'Query too long')
    .regex(/^[a-zA-Z0-9\s\-\_\.]+$/, 'Invalid characters in query'),  // Whitelist chars
});

app.post("/api/knowledge/query", async (req, res) => {
  try {
    const { query } = QueryValidationSchema.parse(req.body);
    // Now safe: query contains only safe characters
  } catch (error) {
    return res.status(400).json({ error: 'Invalid query' });
  }
});
```

2. Use sanitization library:
```typescript
import mongoSanitize from 'mongo-sanitize';

app.post("/api/knowledge/query", async (req, res) => {
  const { query } = req.body;
  const cleanQuery = mongoSanitize(query);  // Removes dangerous chars
  // ...
});
```

---

### FINDING: No Type Validation on /api/persistence/historical?days=

**Severity:** 🟡 MEDIUM  
**CWE:** CWE-20 (Improper Input Validation)  

**Evidence:**
```typescript
// src/index.ts (line 243-249)
app.get("/api/persistence/historical", async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;  // ❌ No bounds check
    // ...
  }
});
```

**Exploit Scenario:**
```bash
curl "http://localhost:3000/api/persistence/historical?days=999999999"
# Results in query for 999999999 days of data
# → Slow MongoDBscan, potential timeout
```

**Minimal Fix:**
```typescript
const DaysParamSchema = z.object({
  days: z.coerce.number()
    .int()
    .min(1, 'Days must be >= 1')
    .max(730, 'Days must be <= 730 (2 years)')
    .optional()
    .default(30),
});

app.get("/api/persistence/historical", async (req, res) => {
  const { days } = DaysParamSchema.parse({ days: req.query.days });
  // Now 'days' is guaranteed 1-730
});
```

---

## Category: Secrets in Logs & Code

### FINDING: Potential API Key Leakage in Logs

**Severity:** 🟡 MEDIUM  
**CWE:** CWE-532 (Insertion of Sensitive Information into Log File)  

**Evidence:**
```typescript
// src/alerts/sendgrid-client.ts (hypothetical, not reviewed in detail)
const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
  headers: {
    'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`
  }
});
console.log('SendGrid response:', response);  // ❌ Could log headers
```

**Risk:** If error occurs and headers logged, API key exposed

**Minimal Fix:**
```typescript
// Never log sensitive headers
console.log('SendGrid response: ' + response.status);  // Safe
// Not: console.log('Response:', response);  // Unsafe

// Use structured logging:
logger.info('alert_sent', {
  alerts_count: count,
  // Never include: authorization, api_key, credentials
});
```

---

## Category: Supply Chain Security

### FINDING: Dependency Versions Not Pinned (Transitive Risk)

**Severity:** 🟡 MEDIUM  
**CWE:** CWE-427 (Uncontrolled Search Path Element)  

**Evidence:**
```json
// package.json
{
  "dependencies": {
    "express": "^4.22.0",       // Allows 4.22.x (minor/patch versions)
    "mongodb": "^6.0.0",        // Allows 6.x.x
    "prom-client": "^15.0.0",   // Allows 15.x.x
    // ...
  }
}
```

**Risk:**
- Minor version `4.22.1` released with security fix → might not get installed
- Transitive dependency `lodash@3.x.x` has known vulnerabilities

**Minimal Fix (Low Priority):**
```json
{
  "dependencies": {
    "express": "4.22.0",        // Exact version
    "mongodb": "6.0.0",         // Exact version
    // ...
  }
}
```

Then use `npm ci` instead of `npm install` in CI/CD

---

## Category: Cryptography

### FINDING: No HTTPS/TLS in docker-compose

**Severity:** 🔴 CRITICAL  
**CWE:** CWE-295 (Improper Certificate Validation)  

**Evidence:**
```yaml
  orchestrator:
    ports:
      - "3000:3000"  # ❌ HTTP only
    # No SSL_CERT, SSL_KEY configuration
```

**Impact:**
- ✅ All traffic sent plaintext
- ✅ API keys visible in wire traffic
- ✅ Webhook payloads readable by network sniffers

**Minimal Fix (for production):**

1. Generate self-signed cert (dev):
```bash
openssl req -x509 -newkey rsa:4096 -nodes \
  -out cert.pem -keyout key.pem -days 365
```

2. Update docker-compose:
```yaml
orchestrator:
  ports:
    - "3000:443"
  volumes:
    - ./cert.pem:/app/cert.pem
    - ./key.pem:/app/key.pem
  environment:
    TLS_ENABLED: "true"
    TLS_CERT_PATH: /app/cert.pem
    TLS_KEY_PATH: /app/key.pem
```

3. Update server initialization:
```typescript
import https from 'https';
import { readFileSync } from 'fs';

const httpsOptions = {
  cert: readFileSync(process.env.TLS_CERT_PATH),
  key: readFileSync(process.env.TLS_KEY_PATH),
};

https.createServer(httpsOptions, app).listen(3000, () => {
  console.log('HTTPS server listening on port 3000');
});
```

---

## Summary Table

| Issue | Severity | Category | Fix Time | Evidence |
|-------|----------|----------|----------|----------|
| Hardcoded credentials in .env | 🔴 | Secrets | 30 min | `.env` hardcoded passwords |
| .env tracked in git | 🔴 | Secrets | 15 min | No .gitignore entry |
| No endpoint auth | 🔴 | AuthN | 2 hours | All endpoints public |
| MongoDB no auth | 🔴 | AuthN | 45 min | `--noauth` in compose |
| No rate limiting | 🔴 | DoS | 1 hour | No middleware |
| No input validation | 🔴 | Input | 2 hours | Only empty checks |
| Default Grafana pwd | 🔴 | AuthN | 15 min | Compose fallback |
| No HTTPS | 🔴 | Transport | 2 hours | HTTP only |
| API key in logs | 🟡 | Secrets | 1 hour | Hypothetical log leaks |
| Unpinned deps | 🟡 | Supply Chain | 30 min | ^version ranges |

**Total time to fix CRITICAL issues:** ~10 hours  
**Total time to fix ALL issues:** ~14 hours

