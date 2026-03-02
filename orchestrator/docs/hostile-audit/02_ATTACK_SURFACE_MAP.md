# 02_ATTACK_SURFACE_MAP.md - Inbound Interfaces & Risk Assessment

Historical snapshot note: This is a dated hostile-audit artifact, not current runtime authority. Some findings in this file may now be stale. Current truth lives in active runtime code, `OPENCLAW_CONTEXT_ANCHOR.md`, and the current KB truth docs under `docs/OPENCLAW_KB/**`.

**Purpose:** Enumerate every inbound attack surface, rate authentication/validation for each, identify mutation endpoints.

---

## HTTP API Attack Surface

### 1. POST /webhook/alerts (AlertManager Webhook)

**Port:** 3000  
**Protocol:** HTTP (no TLS required in compose)  
**Authentication:** ❌ NONE  
**Rate Limiting:** ❌ NONE  
**Input Validation:** ⚠️ MINIMAL  
**Mutates State:** ✅ YES (deduplication state, alert database)  

**Expected Input Schema (Prometheus AlertManager):**
```typescript
interface AlertManagerPayload {
  alerts: PrometheusAlert[];
  groupLabels: Record<string, string>;
  commonLabels: Record<string, string>;
  commonAnnotations: Record<string, string>;
}

interface PrometheusAlert {
  status: 'firing' | 'resolved';
  labels: Record<string, string>;
  annotations: Record<string, string>;
}
```

**Validation Applied:**
- ❌ Schema validation: NONE
- ❌ Signature verification: NONE (AlertManager doesn't sign by default)
- ❌ Rate limiting: NONE
- ❌ Size limits: NONE (can send 10GB JSON payload)
- ⚠️ Field presence: Alert arrays checked for `.length` only

**Exploit Scenarios:**

**Scenario 1a: Alert Flooding (DoS)**
- Attacker sends 10,000 alerts in single request
- Handler loops through all alerts in `alertHandler.ts` line 30
- Each alert → Slack API call (blocking)
- System becomes unresponsive as SendGrid/Slack queues fill
- **Severity:** HIGH
- **Fix:** Require `Content-Length < 1MB`, rate limit to 10 req/min/IP

**Scenario 1b: Malformed JSON → Exception**
```bash
curl -X POST http://localhost:3000/webhook/alerts \
  -H "Content-Type: application/json" \
  -d '{"alerts": "not an array"}'
```
- `req.body` passes to `handleAlertManagerWebhook()`
- Expects `payload.alerts` to be iterable (line 30: `for (const alert of payload.alerts)`)
- If `alerts` is string, loop attempts string iteration → `alert.status` fails
- Error caught at line 187 → 500 response, no guard rails
- **Severity:** LOW (non-error response) but **impact:** Lost monitoring data
- **Fix:** Use `joi` schema validation pre-handler

**Scenario 1c: Injected Alert Metadata**
```json
{
  "alerts": [{
    "status": "firing",
    "labels": {
      "alertname": "CRITICAL_SYSTEM_DOWN",
      "agent": "../../etc/passwd"  // Directory traversal attempt
    }
  }]
}
```
- Labels stored as-is in dedup fingerprint (`alertDeduplicator.ts` line ~45)
- Later used in log messages: `[AlertHandler] Processing alert: ${alertName}`
- If logs are shipped to external system, special chars (newline, null) may cause log injection
- No sanitization of label values
- **Severity:** MEDIUM (log injection → exfiltration)
- **Fix:** Sanitize labels before logging: `JSON.stringify({alertname, agent})`

**Scenario 1d: Null Pointer Crash**
```json
{
  "alerts": [{
    "status": "firing"
    // Missing labels, annotations
  }]
}
```
- Line 46: `alert.labels.alertname` → `undefined` (gracefully handled `|| 'Unknown'`)
- Line 52: `alert.annotations.summary` → `undefined` (handled)
- **Severity:** LOW (defensive coding works)
- **Severity:** ACCEPTABLE

---

### 2. POST /api/knowledge/query (Knowledge Base Search)

**Port:** 3000  
**Authentication:** ❌ NONE  
**Rate Limiting:** ❌ NONE  
**Input Validation:** ⚠️ MINIMAL (non-empty check only)  
**Mutates State:** ❌ NO (read-only)  

**Expected Input:**
```json
{"query": "string"}
```

**Validation Applied:**
```typescript
const { query } = req.body;
if (!query) {
  return res.status(400).json({ error: "query parameter required" });
}
```
- ✅ Non-empty check
- ❌ No max length check
- ❌ No character whitelist
- ❌ No type validation (could be array, object)

**Exploit Scenarios:**

**Scenario 2a: Large Query → Memory Exhaustion (DoS)**
```bash
curl -X POST http://localhost:3000/api/knowledge/query \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$(python3 -c 'print(\"x\"*100000000)')\"}"
```
- `query` is 100MB string
- Passed to `knowledgeOrchestrator.queryKnowledge(query)` (line 68, `src/knowledge/integration.ts`)
- Method calls `this.knowledgeBase.search(query)` → iterates all KB entries, each call does `.toLowerCase().includes(query)`
- Memory spikes as large string processed
- No timeout, no size limit
- **Severity:** HIGH
- **Fix:** Add `if (query.length > 5000) return 400`

**Scenario 2b: Future NoSQL Injection Risk**
```json
{"query": "test'; db.knowledge_base.drop(); //"}
```
- Current code: In-memory search, safe (`.includes()` is string matching)
- **Risk:** If code refactors to MongoDB `$where` or `regex` without sanitization, injection becomes possible
- **Severity:** MEDIUM (latent)
- **Fix:** Use `mongo-sanitize` even if not currently vulnerable

**Scenario 2c: Type Confusion**
```json
{"query": [1, 2, 3]}
```
- Handler expects string
- `line 68`: `knowledgeOrchestrator.queryKnowledge(query)` where `query` is array
- `knowledge-base.ts` line 145: `const lowerQuery = query.toLowerCase();`
- Array has no `.toLowerCase()` → TypeError thrown
- Caught somewhere (Express error handler), 500 response
- **Severity:** LOW (non-exploitable) but **impact:** Monitoring alert lost
- **Fix:** Use `typeof query === 'string'` check

---

### 3. GET /api/persistence/export (Database Export Endpoint)

**Port:** 3000  
**Authentication:** ❌ NONE  
**Rate Limiting:** ❌ NONE  
**Input Validation:** N/A (no parameters)  
**Mutates State:** ❌ NO  
****Risk Profile:** 🔴 CRITICAL - Unauthenticated data exfiltration  

**Response Contains:**
```json
{
  "exportDate": "...",
  "collections": {
    "metrics": 15000,
    "alerts": 8000,
    "knowledge_base": 250,
    ...
  },
  "databaseSizeMB": "2450.00"
}
```

**Exploit Scenarios:**

**Scenario 3a: Information Disclosure**
```bash
for i in {1..1000}; do
  curl -s http://localhost:3000/api/persistence/export
done
```
- Response reveals exact collection sizes: metric count, alert count
- Attacker infers system load, alert volume, incident frequency
- Can correlate with public incidents → deanonymization
- **Severity:** MEDIUM (information disclosure)
- **Fix:** Require authentication

**Scenario 3b: Resource Exhaustion (Slow Endpoint)**
```typescript
// src/persistence/persistence-integration.ts (hypothetical implementation)
async exportAllData(): Promise<any> {
  const stats = {};
  for (const colName in COLLECTIONS) {
    const col = db.collection(colName);
    stats[colName] = await col.countDocuments(); // 💥 SLOW without index
  }
  return stats;
}
```
- If called 100 concurrent times (simple script), each `countDocuments()` locks MongoDB
- Database becomes unresponsive
- Legitimate queries timeout → service down
- **Severity:** HIGH
- **Fix:** Add rate limit (5 req/min/IP), cache results (TTL 1 min)

---

### 4. GET /api/persistence/historical (30-day Data Query)

**Port:** 3000  
**Authentication:** ❌ NONE  
**Rate Limiting:** ❌ NONE  
**Input Validation:** ⚠️ PARTIAL (parameter type coercion only)  
**Mutates State:** ❌ NO  

**Parameters:**
```
?days=30 (default)
```

**Validation Applied:**
```typescript
const days = parseInt(req.query.days as string) || 30;
const data = await PersistenceIntegration.getHistoricalData(days);
```

**Exploit Scenarios:**

**Scenario 4a: Parameter Injection → Out-of-Bounds Query**
```bash
curl http://localhost:3000/api/persistence/historical?days=9999999
```
- `parseInt('9999999')` → 9999999 (valid)
- Query for 9999999 days of data
- Database scan extremely slow or OOM
- **Severity:** MEDIUM
- **Fix:** Add bounds check: `const days = Math.min(Math.max(parseInt(...) || 30, 1), 365);`

**Scenario 4b: NaN Attack**
```bash
curl http://localhost:3000/api/persistence/historical?days=not_a_number
```
- `parseInt('not_a_number')` → `NaN`
- `NaN || 30` → 30 (safe, fallback works)
- **Severity:** LOW (handled safely)

**Scenario 4c: Negative Days**
```bash
curl http://localhost:3000/api/persistence/historical?days=-1
```
- `parseInt('-1')` → -1
- Query might interpret as "future data" or error
- B  ehavior undefined (depends on implementation)
- **Severity:** LOW-MEDIUM
- **Fix:** Validate `days >= 1`

---

### 5. GET /api/persistence/health (MongoDB Health Check)

**Port:** 3000  
**Authentication:** ❌ NONE (acceptable - informational)  
**Rate Limiting:** ❌ NONE (low CPU cost)  
**Input Validation:** N/A  
**Mutates State:** ❌ NO  
**Risk:** 🟡 LOW - Information disclosure only  

**Response:**
```json
{
  "status": "healthy",
  "database": true,
  "collections": 9
}
```

**Acceptable Risk Rationale:**
- Returns only status, not credentials
- Low information value (attackers already know services if they're on network)
- No parameters = no injection risk
- Monitoring dependency: Internal health checks require this

---

### 6. GET /api/knowledge/summary (KB Statistics)

**Port:** 3000  
**Authentication:** ❌ NONE (acceptable - informational)  
**Rate Limiting:** ❌ NONE (low CPU)  
**Mutates State:** ❌ NO  
**Risk:** 🟡 LOW - Information disclosure  

**Response Contains:**
```json
{
  "stats": {
    "total": 42,
    "byCategory": {...},
    "recentUpdates": [...]
  },
  "networkStats": {...}
}
```

**Acceptable Risk Rationale:**
- Aggregated data only, not sensitive
- Used by frontend for dashboard
- Read-only operation
- Public endpoint is reasonable

---

### 7. GET /api/knowledge/export (KB Export)

**Port:** 3000  
**Authentication:** ❌ NONE  
**Rate Limiting:** ❌ NONE  
**Input Validation:** ⚠️ PARTIAL (format parameter)  
**Mutates State:** ❌ NO  
**Risk:** 🟡 MEDIUM - Potential DoS, information disclosure  

**Parameters:**
```
?format=markdown|json (default: markdown)
```

**Validation Applied:**
```typescript
const format = (req.query.format as string) || "markdown";
const kb = knowledgeIntegration.export(format as 'markdown' | 'json');
```

**Exploit Scenarios:**

**Scenario 7a: Format Parameter Injection**
```bash
curl "http://localhost:3000/api/knowledge/export?format=xml"
```
- `format` is cast to string, not validated against enum
- Line 227: `if (format === 'markdown')` → false
- Falls through to implicit `else` case
- Returns JSON (safe fallback)
- **Severity:** LOW (type system works)

**Scenario 7b: Large Export DoS**
```bash
while true; do curl http://localhost:3000/api/knowledge/export > /dev/null; done
```
- Markdown generation iterates all KB entries, builds large string
- CPU spikes, memory fills
- Concurrent 10 requests → Node.js thread exhaustion
- **Severity:** HIGH
- **Fix:** Add rate limit (10 req/min/IP), async export with streaming

---

### 8. GET /health (System Health)

**Port:** 3000  
**Authentication:** ❌ NONE (acceptable - public)  
**Risk:** 🟢 LOW - Informational only  

---

## Non-HTTP Inbound Interfaces

### Cron Jobs (Scheduled Tasks)

**Execution:**
1. `0 23 * * *` (11 PM UTC) → `nightly-batch` task
2. `0 6 * * *` (6 AM UTC) → `send-digest` task
3. `*/5 * * * *` (every 5 min) → `heartbeat` task

**Risk:** 🟢 LOW - Internal, no external input

### Database Webhooks (Future)

**Risk:** TBD - Not currently implemented

**MongoDB Change Streams (hypothetical):**
- If implemented, would listen for insertions/updates
- Risk: Unbounded event handler execution
- **Fix (if added):** Add queue length limits, timeout on each handler

---

## External Service Dependencies (Outbound)

**Not attack surface (outbound only):**
- SendGrid SMTP (authentication via API key)
- Slack Webhook (authentication via URL secret)
- MongoDB (no network auth currently)
- Redis (no network auth currently)

---

## File System Interfaces

### Config File Loading

**Files:**
- `./orchestrator_config.json`
- `.env`

**Risks:**
- **Path traversal:** `require(process.env.CUSTOM_CONFIG)` without validation
- **Not observed:** Config loading is hardcoded
- **Severity:** LOW

### Data Directory Access

**Paths:**
- `./data/snapshots/` (JSON files written by node process)
- `./logs/` (append-only logs)

**Risk:** 🟡 MEDIUM - If container compromised, attacker can modify snapshots
**Fix:** Ensure files owned by `orchestrator` user with restricted perms (644)

---

## Authentication & Authorization Matrix

| Endpoint | Auth | Validation | Rate Limit | Mutation | Risk |
|----------|------|-----------|-----------|----------|------|
| POST /webhook/alerts | ❌ | ⚠️ | ❌ | ✅ | 🔴 CRITICAL |
| POST /api/knowledge/query | ❌ | ⚠️ | ❌ | ❌ | 🟡 MEDIUM |
| GET /api/persistence/export | ❌ | N/A | ❌ | ❌ | 🔴 CRITICAL |
| GET /api/persistence/historical | ❌ | ⚠️ | ❌ | ❌ | 🟡 MEDIUM |
| GET /api/persistence/health | ❌ | N/A | N/A | ❌ | 🟢 LOW |
| GET /api/knowledge/summary | ❌ | N/A | N/A | ❌ | 🟢 LOW |
| GET /api/knowledge/export | ❌ | ⚠️ | ❌ | ❌ | 🟡 MEDIUM |
| GET /health | ❌ | N/A | N/A | ❌ | 🟢 LOW |

**Summary:**
- **0 of 8 endpoints** have authentication
- **2 of 8 endpoints** have proper input validation
- **0 of 8 endpoints** have rate limiting
- **1 of 8 endpoints** mutates state (webhook)

---

## State Mutation Analysis

**Only endpoint that mutates:** `POST /webhook/alerts`

**What it mutates:**
1. `alertDeduplicator` state (fingerprint cache, 10-min sliding window)
2. `alertManager` state (alert history, dedup tracking)
3. Side effects: Slack API calls, SendGrid calls (external state)

**No guards:**
- ❌ Rate limiting
- ❌ Authentication
- ❌ Authorization
- ❌ Idempotency key
- ✅ Deduplication (local, 10-min window)

**Risk:** Attacker can create alert storms, impersonate real incidents, train models on fake data

---

## Denial of Service Surface

**Endpoints vulnerable to DoS:**

1. **POST /webhook/alerts** - Unbounded payload size, no rate limit
   - Mitigation: Add `Content-Length < 10MB` limit, 100 req/min/IP

2. **GET /api/persistence/export** - Expensive operation, no caching
   - Mitigation: Add 5 req/min/IP limit, cache results 60 seconds

3. **GET /api/knowledge/export** - Large string generation
   - Mitigation: Add 10 req/min/IP limit

4. **POST /api/knowledge/query** - Unbounded query string
   - Mitigation: Max length 5000 chars

---

## SSRF Surface

**No outbound fetcher endpoints observed.** (Prometheus scrapes inbound, not exploitable)

---

## Summary of Mutation Boundaries

**Endpoints capable of mutating state:**
- ✅ POST /webhook/alerts (dedup + alert state)

**Endpoints with irreversible side effects:**
- ✅ POST /webhook/alerts → SendGrid/Slack calls (notifications sent)

**Endpoints that expose retrieval capabilities:**
- ✅ GET /api/persistence/export (full DB stats)

**Access Control Decision Matrix:**

| Action | Current | Required | Gap |
|--------|---------|----------|-----|
| Create alert | unauthenticated | Bearer token | ❌ CRITICAL |
| Query KB | unauthenticated | API key or token | ❌ CRITICAL |
| Export DB | unauthenticated | Bearer token + rate limit | ❌ CRITICAL |
| Read health | unauthenticated | Public (acceptable) | ✅ OK |
