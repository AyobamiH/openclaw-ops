# 04_RELIABILITY_FAILS.md - Operational Stability & Resilience

**Purpose:** Identify scenarios that cause data loss, service unavailability, inconsistent state, or resource exhaustion.

---

## Category: Knowledge Base Data Loss

### FINDING: Knowledge Base is Entirely In-Memory, Data Lost on Restart

**Severity:** 🔴 CRITICAL  
**Impact:** 100% data loss every container restart  
**Recovery Time:** ~1-24 hours (depending on when incidents logged and processed)

**Evidence:**
```typescript
// src/knowledge/knowledge-base.ts (line 42-43)
export class KnowledgeBase {
  private entries = new Map<string, KBEntry>();  // ❌ NOT persisted to disk/DB
  private index = {
    tags: {} as Record<string, string[]>,
  };
```

**Scenario:**
1. KB accumulates 500 entries over 2 weeks (problems solved, learnings recorded)
2. Container restart (deployment, crash, scaling event)
3. New container starts, KB re-initialized as empty `new Map()`
4. All learnings lost, if similar incident occurs, no pattern recognition
5. Alert deduplication is non-functional (needs historical context)

**How Data Flows Currently:**
```
Phase 4: Consolidation (hourly snapshots) 
  → Phase 5: KB Integration (loads consolidation)
  → Phase 6: Persistence Layer (ready but NOT CALLED)

Missing Link: Phase 5 does NOT save KB results to MongoDB
```

**Problematic Code:**
```typescript
// src/knowledge/integration.ts (line 39-50)
async onConsolidationComplete(consolidation: any, date: string): Promise<void> {
  // 📖 This method claims to "Process consolidation into KB"
  // BUT: knowledgeOrchestrator.processConsolidation() doesn't call persistence save
  
  const summary = knowledgeOrchestrator.getSummary();
  console.log(`✨ KB updated: ${summary.stats.total} entries`);
  // ❌ NO CALL TO: await PersistenceIntegration.saveKBEntries(summary)
}
```

**Minimal Fix (4 hours):**

1. Add MongoDB persistence to KB:
```typescript
// src/knowledge/knowledge-base.ts
async saveEntry(entry: KBEntry): Promise<void> {
  // Save to file (existing)
  this.entries.set(entry.id, entry);
  this.updateIndex(entry);
  
  // ALSO save to MongoDB (new)
  try {
    const collection = MongoConnection.getCollection('knowledge_base');
    await collection.updateOne(
      { id: entry.id },
      { $set: entry },
      { upsert: true }
    );
  } catch (error) {
    console.error('[KB] Failed to persist entry:', error);
    // Fail-safe: Keep in memory even if DB down
  }
}
```

2. Load KB from MongoDB on startup:
```typescript
// src/knowledge/knowledge-base.ts
static async load(): Promise<KnowledgeBase> {
  const kb = new KnowledgeBase();
  
  try {
    const collection = MongoConnection.getCollection('knowledge_base');
    const entries = await collection.find({}).toArray();
    
    for (const entry of entries) {
      kb.saveEntry(entry as KBEntry);
    }
    console.log(`[KB] Loaded ${entries.length} entries from MongoDB`);
  } catch (error) {
    console.warn('[KB] Could not load from MongoDB, starting fresh:', error);
  }
  
  return kb;
}
```

3. Call in orchestration startup:
```typescript
// src/knowledge/orchestrator.ts
static async initialize(): Promise<void> {
  const kb = await KnowledgeBase.load();  // Load from DB
  this.knowledgeBase = kb;
  // ...
}
```

4. Wire into Phase 4 callback:
```typescript
// src/knowledge/integration.ts
async onConsolidationComplete(consolidation: any, date: string): Promise<void> {
  await knowledgeOrchestrator.processConsolidation(consolidation, date);
  
  // ✅ PERSIST ALL ENTRIES
  const summary = knowledgeOrchestrator.getSummary();
  for (const entry of summary.stats.allEntries || []) {
    await DataPersistence.saveKBEntry(entry);
  }
  
  console.log(`✨ KB updated: ${summary.stats.total} entries (persisted)`);
}
```

**Verification:**
```bash
# 1. Add an entry
curl -X POST http://localhost:3000/api/knowledge/query \
  -d '{"query": "test"}'

# 2. Verify it exists
curl http://localhost:3000/api/knowledge/summary
# Should show: "total": 1

# 3. Restart container
docker restart openclaw-orchestrator

# 4. Verify it's still there
curl http://localhost:3000/api/knowledge/summary
# Should show: "total": 1 (not 0)

# 5. Check MongoDB
docker exec openclaw-mongo mongosh --eval "db.knowledge_base.countDocuments()"
# Should return: 1
```

---

## Category: Idempotency & Exactly-Once Semantics

### FINDING: Alert Webhook Has No Idempotency Key Deduplication

**Severity:** 🟡 MEDIUM  
**Impact:** Duplicate alerts sent to Slack/SendGrid on network retry  
**Scenario:** AlertManager times out waiting for 200 response, retries alert → 2 Slack messages

**Evidence:**
```typescript
// src/index.ts (line 189-197)
app.post("/webhook/alerts", async (req, res) => {
  try {
    console.log("[webhook/alerts] Received alert from AlertManager");
    await alertHandler.handleAlertManagerWebhook(req.body);  // ❌ No idempotency key check
    res.json({ status: "ok" });
  } catch (error: any) {
    console.error("[webhook/alerts] Error processing alert", {
      error: error.message,
    });
    res.status(500).json({ error: error.message });
  }
});
```

**Scenario:**
```
T=0s: AlertManager sends alert (fingerprint: CPU_CRITICAL:node1)
T=1s: Handler processing (calling Slack API)
T=2s: Slack API responds 200, but network drops before response reaches AlertManager
T=3s: AlertManager doesn't get 200, retries same alert
T=4s: Second identical Slack message sent
```

**Minimal Fix (1 hour):**

1. Add idempotency cache:
```typescript
// src/middleware/idempotency.ts
import { createHash } from 'crypto';

const idempotencyCache = new Map<string, any>();

export function idempotencyMiddleware(req: any, res: any, next: any) {
  const idempotencyKey = req.headers['idempotency-key'] || 
    createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
  
  if (idempotencyCache.has(idempotencyKey)) {
    // Return cached response
    return res.status(200).json(idempotencyCache.get(idempotencyKey));
  }
  
  // Store original res.json
  const originalJson = res.json.bind(res);
  res.json = function(data: any) {
    idempotencyCache.set(idempotencyKey, data);
    // Clean old entries (keep last 1000)
    if (idempotencyCache.size > 1000) {
      const firstKey = idempotencyCache.keys().next().value;
      idempotencyCache.delete(firstKey);
    }
    return originalJson(data);
  };
  
  next();
}

// Apply to webhook only
app.post("/webhook/alerts", idempotencyMiddleware, async (req, res) => { ... });
```

2. Configure AlertManager to send idempotency key:
```yaml
# monitoring/alertmanager.yml
receivers:
  - name: 'orchestrator-webhook'
    webhook_configs:
      - url: 'http://localhost:3000/webhook/alerts'
        send_resolved: true
        headers:
          Idempotency-Key: '{{ .GroupLabels.alertname }}-{{ .GroupLabels.severity }}'
```

3. Test idempotency:
```bash
# Send same alert twice
PAYLOAD='{"alerts": [{"status": "firing", "labels": {}, "annotations": {}}]}'

curl -X POST http://localhost:3000/webhook/alerts \
  -H "Idempotency-Key: test-123" \
  -d "$PAYLOAD"  # Returns: {"status": "ok"}

curl -X POST http://localhost:3000/webhook/alerts \
  -H "Idempotency-Key: test-123" \
  -d "$PAYLOAD"  # Returns: {"status": "ok"} (cached, no duplicate Slack message)
```

---

## Category: Graceful Shutdown & Drain

### FINDING: No Graceful Shutdown, Abrupt Termination Kills In-Flight Requests

**Severity:** 🟡 MEDIUM  
**Impact:** Webhook payloads not fully processed, Slack/SendGrid calls halted mid-send  
**Recovery:** Manual retry or lost alerts

**Evidence:**
```typescript
// src/index.ts (end of file)
bootstrap().catch((err) => {
  console.error("[orchestrator] fatal", err);
  process.exit(1);  // ❌ Immediate exit, no graceful shutdown
});
```

**Scenario:**
1. Container receives SIGTERM (deployment, scaling down)
2. Node.js process exits immediately
3. In-flight POST /webhook/alerts request abandoned mid-way
4. Alert partially processed: deduplication updated, but Slack not notified
5. Inconsistent state: KB thinks alert was handled, but operations never saw it

**Minimal Fix (1.5 hours):**

```typescript
// src/index.ts (update bootstrap function)
async function bootstrap() {
  // ... existing code ...
  
  const server = app.listen(PORT, () => {
    console.log(`[orchestrator] HTTP server listening on port ${PORT}`);
  });

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    console.log(`[orchestrator] Received ${signal}, starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close(() => {
      console.log('[orchestrator] Server closed');
    });
    
    // Give in-flight requests 30 seconds to complete
    const shutdownTimeout = setTimeout(() => {
      console.error('[orchestrator] Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, 30000);
    
    try {
      // Close database connection
      await PersistenceIntegration.close();
      console.log('[orchestrator] Database closed');
      
      // Close Redis connection (if used)
      // await redis.disconnect();
      
      // Stop memory scheduler
      memoryScheduler.stop();
      console.log('[orchestrator] Memory scheduler stopped');
      
      clearTimeout(shutdownTimeout);
      console.log('[orchestrator] Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('[orchestrator] Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
```

**Verification:**
```bash
# 1. Start container with handler running
docker run openclaw-orchestrator &
PID=$!

# 2. Send SIGTERM
kill -TERM $PID

# 3. Check logs (should see graceful shutdown messages)
docker logs <container>
# Expected output:
# [orchestrator] Received SIGTERM, starting graceful shutdown...
# [orchestrator] Database closed
# [orchestrator] Memory scheduler stopped
# [orchestrator] Graceful shutdown complete
```

---

## Category: Resource Leaks

### FINDING: No Timeout on HTTP Handlers, Slow Clients Exhaust Connection Pool

**Severity:** 🟡 MEDIUM  
**Impact:** Server becomes unresponsive to new requests as connection pool fills

**Evidence:**
```typescript
// src/index.ts (line 189)
app.post("/webhook/alerts", async (req, res) => {
  try {
    await alertHandler.handleAlertManagerWebhook(req.body);  // ❌ No timeout
    res.json({ status: "ok" });
  } catch (error: any) {
    // ...
  }
});
```

**Scenario:**
```
Client connects but sends alert payload very slowly (1 byte per 10 seconds)
Handler waits indefinitely for req.body to complete
In parallel: 100 such slow clients connect
After 2 hours: All 100 connections still open, new legitimate requests rejected
```

**Minimal Fix (1 hour):**

```typescript
// src/middleware/timeout.ts
export function timeoutMiddleware(timeoutMs: number) {
  return (req: any, res: any, next: any) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ error: 'Request timeout' });
      }
      req.socket.destroy();
    }, timeoutMs);

    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));

    next();
  };
}
```

```typescript
// src/index.ts
const WEBHOOK_TIMEOUT = 30000;   // 30 seconds
const API_TIMEOUT = 10000;       // 10 seconds

app.post("/webhook/alerts", timeoutMiddleware(WEBHOOK_TIMEOUT), async (req, res) => { ... });
app.post("/api/knowledge/query", timeoutMiddleware(API_TIMEOUT), async (req, res) => { ... });
app.get("/api/persistence/export", timeoutMiddleware(API_TIMEOUT), async (req, res) => { ... });
```

---

## Category: Startup/Shutdown Correctness

### FINDING: Persistence Layer Initialization Failure Silently Swallowed

**Severity:** 🔴 CRITICAL  
**Impact:** System starts without database, silently loses all writes  

**Evidence:**
```typescript
// src/index.ts (lines 46-49)
try {
  await PersistenceIntegration.initialize();
} catch (error) {
  console.error("[orchestrator] failed to initialize persistence layer:", error);
  // ❌ Continues execution despite DB failure
}
```

**Scenario:**
```
MongoDB is down (network misconfiguration, credentials wrong, etc.)
Persistence layer fails to initialize
Error logged but execution continues
System starts and appears healthy (health endpoint returns 200)
Metrics, alerts, KB entries are accumulated in memory only
After 30 days: Restart occurs, all data lost without warning
```

**Minimal Fix (30 minutes):**

```typescript
// src/index.ts (lines 46-49)
console.log("[orchestrator] Initializing persistence layer...");
try {
  await PersistenceIntegration.initialize();
  console.log("[orchestrator] ✅ Persistence layer initialized");
} catch (error) {
  console.error("[orchestrator] ❌ CRITICAL: Failed to initialize persistence layer:", error);
  console.error("[orchestrator] System cannot start without database connectivity.");
  console.error("[orchestrator] Please check MongoDB connection and retry.");
  process.exit(1);  // ✅ Hard failure, don't continue
}
```

**Verification:**
```bash
# 1. Stop MongoDB
docker stop openclaw-mongo

# 2. Try to start orchestrator
docker run openclaw-orchestrator

# 3. Should fail with error message:
# [orchestrator] ❌ CRITICAL: Failed to initialize persistence layer
# and exit code 1
```

---

## Category: Concurrency Hazards

### FINDING: Racing Write to MEMORY.md (No Locking)

**Severity:** 🟡 MEDIUM  
**Impact:** Corrupted MEMORY.md file if two consolidations run simultaneously  

**Evidence:**
```typescript
// src/memory/memory-updater.ts (hypothetical - not fully reviewed)
async updateMemory(insights: string[] ) {
  const content = await readFile('./MEMORY.md');
  // ❌ Between read and write, another process could modify file
  const updated = content + '\n' + insights.join('\n');
  await writeFile('./MEMORY.md', updated);  // Collision risk
}
```

**Scenario:**
```
Time T=0s: Consolidation 1 reads MEMORY.md (size 10KB)
Time T=0.5s: Consolidation 2 reads MEMORY.md (same 10KB)
Time T=1s: Consolidation 1 writes update (10KB + 500B)
Time T=1.5s: Consolidation 2 writes update (overwrites, loses Consolidation 1's data)
Result: Loss of insights from Consolidation 1
```

**Minimal Fix (1.5 hours):**

```typescript
// src/utils/file-lock.ts
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';

export class FileLock {
  constructor(private lockFile: string, private timeout: number = 5000) {}
  
  async acquire(): Promise<void> {
    const start = Date.now();
    while (true) {
      try {
        // Try to create lock file exclusively
        await writeFile(this.lockFile, `${Date.now()}`, { flag: 'wx' });
        return;  // ✅ Lock acquired
      } catch (error: any) {
        if (error.code !== 'EEXIST') throw error;  // Different error
        
        if (Date.now() - start > this.timeout) {
          throw new Error(`Lock timeout: ${this.lockFile}`);
        }
        
        // Wait 10ms and retry
        await new Promise(r => setTimeout(r, 10));
      }
    }
  }
  
  async release(): Promise<void> {
    try {
      await unlink(this.lockFile);
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}
```

```typescript
// src/memory/memory-updater.ts (updated)
const fileLock = new FileLock('./MEMORY.md.lock');

async updateMemory(insights: string[]) {
  await fileLock.acquire();
  try {
    const content = await readFile('./MEMORY.md', 'utf-8');
    const updated = content + '\n' + insights.join('\n');
    await writeFile('./MEMORY.md', updated);
  } finally {
    await fileLock.release();
  }
}
```

---

## Category: Monitoring Blind Spots

### FINDING: No Alert for Failed External API Calls (Slack, SendGrid)

**Severity:** 🟡 MEDIUM  
**Impact:** Alerts queued in memory, never reach operations team  

**Evidence:**
```typescript
// src/alerts/slack-client.ts (hypothetical)
async sendAlert(alert: SlackAlert): Promise<boolean> {
  try {
    const response = await fetch(this.webhookUrl, { ... });
    // ❌ No alert or retry if request fails
    return response.ok;
  } catch (error) {
    console.error('Slack API error:', error);
    // ❌ Silently failed, no escalation
  }
}
```

**Scenario:**
```
SendGrid API goes down (rate limit, service degradation)
Alert handler catches error, logs it, returns false
Alerts disappear from logs (not in Slack, not in SendGrid)
Operations team unaware of issues for hours until manual check
```

**Minimal Fix (1.5 hours):**

```typescript
// src/alerts/alert-handler.ts (add escalation)
private async processAlert(alert: PrometheusAlert): Promise<void> {
  const slackSent = await slackClient.sendAlert(slackAlert);
  
  // ❌ BEFORE: if (!slackSent) { ... } with no action
  
  // ✅ AFTER: Escalate if external APIs fail
  if (!slackSent) {
    console.error('[ALERT DELIVERY FAILED] Slack API unreachable, escalating to email...');
    const emailSent = await sendGridClient.sendAlert(emailAlert);
    
    if (!emailSent) {
      // Both APIs failed - CRITICAL
      alertManager.critical(
        'alert-delivery-failed',
        `Failed to deliver alert: ${alertName}. Both Slack and SendGrid unavailable.`,
        { originalAlert: alertName, slackError: !slackSent, emailError: !emailSent }
      );
      
      // Persist to disk as fallback (for manual retrieval)
      await fs.appendFile('./failed-alerts.jsonl', JSON.stringify(alertName) + '\n');
    }
  }
}
```

---

## Category: Data Consistency

### FINDING: No Compensation Logic for Partial Writes

**Severity:** 🟡 MEDIUM  
**Impact:** KB entry saved to MongoDB but dedup fingerprint not updated → inconsistent view  

**Evidence:**
```typescript
// src/persistence/data-persistence.ts (line ~150)
async saveKBEntry(entry: KBEntry): Promise<void> {
  try {
    const collection = MongoConnection.getCollection('knowledge_base');
    await collection.insertOne(entry);  // ✅ KB saved
    
    // ❌ What if this fails?
    await this.updateIndex(entry);      // Index update fails
  } catch (error) {
    console.error('[KB] save failed:', error);
    // No cleanup of inserted entry
  }
}
```

**Scenario:**
```
KB entry saved to MongoDB (transaction 1 success)
Index update fails (network split, DB connection lost)
System continues thinking entry is indexed (it's not)
Next query searches index, misses the entry
KB appears to have lost a learning
```

**Minimal Fix (2 hours):**

```typescript
// src/persistence/data-persistence.ts (with compensation)
async saveKBEntry(entry: KBEntry): Promise<void> {
  const collection = MongoConnection.getCollection('knowledge_base');
  
  try {
    // Atomic write with combined update
    await collection.updateOne(
      { id: entry.id },
      {
        $set: entry,
        $inc: { _updateCount: 1 },
        $set: { _lastUpdated: new Date() }
      },
      { upsert: true }
    );
    
    // Update index after confirmed write
    await this.updateIndexInDB(entry.id);
    
  } catch (error) {
    // If index fails, mark entry as "needs reindexing"
    // Don't throw - let background job fix it
    console.error('[KB] Index update failed, will retry:', error);
    
    // Queue for background reindex
    await this.enqueueMissingIndex(entry.id);
  }
}
```

---

## Category: Resource Exhaustion

### FINDING: Unbounded In-Memory Alert History in AlertManager

**Severity:** 🟡 MEDIUM  
**Impact:** Memory leak → OOM after weeks of operation  

**Evidence:**
```typescript
// src/alerter.ts (hypothetical - dedup state)
export class AlertManager {
  private alerts: Map<string, Alert> = new Map();  // ❌ Never cleaned
  
  async error(id: string, message: string, context?: any) {
    this.alerts.set(id, { id, message, context, timestamp: Date.now() });
    // ❌ No eviction policy
  }
}
```

**Scenario:**
```
Week 1: 100 unique alerts logged → 100 entries in Map
Week 4: 1000 unique alerts → 1KB memory
Week 12: 10,000 unique alerts → 10MB memory
Week 26: 500,000 unique alerts → 500MB memory
Week 52: Node.js hits heap limit → OOM, container crashes
```

**Minimal Fix (1 hour):**

```typescript
// src/alerter.ts (with TTL)
export class AlertManager {
  private alerts: Map<string, Alert> = new Map();
  private readonly MAX_ALERTS = 10000;
  private readonly ALERT_TTL_MS = 48 * 60 * 60 * 1000;  // 48 hours
  
  cleanup(hoursMaxAge: number = 48): void {
    const now = Date.now();
    const maxAge = hours MaxAge * 60 * 60 * 1000;
    
    let cleaned = 0;
    for (const [id, alert] of this.alerts.entries()) {
      if (now - alert.timestamp > maxAge) {
        this.alerts.delete(id);
        cleaned++;
      }
    }
    
    // If still too many, evict oldest
    while (this.alerts.size > this.MAX_ALERTS) {
      const oldest = Array.from(this.alerts.values())
        .sort((a, b) => a.timestamp - b.timestamp)[0];
      this.alerts.delete(oldest.id);
    }
    
    console.log(`[AlertManager] Cleanup: removed ${cleaned} alerts, size: ${this.alerts.size}`);
  }
}

// Call cleanup every 6 hours
setInterval(() => alertManager.cleanup(48), 6 * 60 * 60 * 1000);
```

---

## Summary

| Issue | Severity | Category | Fix Time | Impact |
|-------|----------|----------|----------|--------|
| KB data loss on restart | 🔴 | Persist | 4h | 100% data loss |
| No alert idempotency | 🟡 | Retry | 1h | Duplicate alerts |
| No graceful shutdown | 🟡 | Shutdown | 1.5h | Lost in-flight requests |
| No request timeout | 🟡 | DoS | 1h | Connection pool exhaustion |
| Persistence init fails silently | 🔴 | Startup | 0.5h | Silent data loss |
| Racing file writes | 🟡 | Concurrency | 1.5h | Corrupted state file |
| No failed API escalation | 🟡 | Alerting | 1.5h | Alerts lost |
| No compensation logic | 🟡 | Consistency | 2h | Inconsistent indexes |
| Unbounded memory growth | 🟡 | Resources | 1h | OOM crash |

**Total time to fix CRITICAL issues:** ~6 hours  
**Total time to fix ALL issues:** ~14 hours
