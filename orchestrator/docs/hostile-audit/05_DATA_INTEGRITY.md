# 05_DATA_INTEGRITY.md - Database Schema & Migration Safety

---

## MongoDB Schema Validation

### FINDING: No Schema Validation Enforced in MongoDB

**Severity:** 🟡 MEDIUM  
**Impact:** Invalid documents can be written, downstream code crashes on unexpected fields

**Evidence:**
```typescript
// src/persistence/mongo-connection.ts (creates indexes but no schema validation)
private static async createIndexes(): Promise<void> {
  const db = this.getDb();
  const metricsCol = db.collection('metrics');
  await metricsCol.createIndex({ timestamp: -1 });
  // ❌ No MongoDB $jsonSchema validation
}
```

**Minimal Fix:**
```typescript
await db.createCollection('metrics', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'value', 'timestamp'],
      properties: {
        name: { bsonType: 'string' },
        value: { bsonType: ['double', 'int'] },
        timestamp: { bsonType: 'date' },
        unit: { bsonType: 'string' },
        labels: { bsonType: 'object' }
      }
    }
  }
});
```

---

### FINDING: No Database Migrations System

**Severity:** 🔴 CRITICAL  
**Impact:** Schema changes corrupt existing data or break code reading old documents

**Evidence:**
- No `migrations/` folder
- No version tracking in `system_state` collection
- No index versioning
- No rollback procedure

**Scenario:**
```
Phase 1: Add field "category" to metrics
  → Code: metrics.category = 'cpu' | 'memory' | 'disk'
  → Old docs in DB have no category field
  → New code calls metric.category.toUpperCase() → TypeError

Phase 2: Need to backfill: Update all old metrics with category=null
  → But no migration tool, manual script fails
  → Data corruption
```

**Minimal Fix (3 hours):**

```typescript
// src/persistence/migrations.ts
export const migrations = [
  {
    version: 1,
    name: 'initial-schema',
    up: async (db: Db) => {
      console.log('[Migration] v1: Creating collections...');
      // Collections auto-created on first write
    },
    down: async (db: Db) => {
      await db.dropCollection('metrics').catch(() => {});
    }
  },
  
  {
    version: 2,
    name: 'add-category-to-metrics',
    up: async (db: Db) => {
      console.log('[Migration] v2: Adding category field...');
      const metrics = db.collection('metrics');
      await metrics.updateMany({}, { $set: { category: 'unknown' } });
      await metrics.createIndex({ category: 1 });
    },
    down: async (db: Db) => {
      const metrics = db.collection('metrics');
      await metrics.updateMany({}, { $unset: { category: '' } });
      await metrics.dropIndex('category_1');
    }
  }
];

export async function runMigrations(db: Db): Promise<void> {
  const state = db.collection('system_state');
  let currentVersion = 0;
  
  try {
    const record = await state.findOne({ key: 'schema_version' });
    currentVersion = record?.value || 0;
  } catch {}
  
  const targetVersion = migrations.length;
  
  if (currentVersion === targetVersion) {
    console.log('[Migrations] Already at latest version:', currentVersion);
    return;
  }
  
  console.log(`[Migrations] Running v${currentVersion + 1} to v${targetVersion}`);
  
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      console.log(`[Migrations] Applying ${migration.name}...`);
      await migration.up(db);
      await state.updateOne(
        { key: 'schema_version' },
        { $set: { value: migration.version } },
        { upsert: true }
      );
    }
  }
  
  console.log('[Migrations] Complete');
}
```

---

## Data Lifecycle Issues

### FINDING: Data Retention Policy Not Enforced

**Severity:** 🟡 MEDIUM  
**Impact:** Unbounded database growth, disk space exhaustion  

**Evidence:**
```typescript
// docs/DEPLOYMENT_GUIDE.md claims "90-day rolling metrics retention"
// But src/persistence/data-persistence.ts has NO cleanup code

async deleteOldMetrics(daysOld: number): Promise<number> {
  // ✅ Method exists
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  const result = await collection.deleteMany({ timestamp: { $lt: cutoff } });
  return result.deletedCount;
}

// ❌ Method is NEVER CALLED
// No scheduler job, no timer, no background cleanup
```

**Minimal Fix (1.5 hours):**

```typescript
// src/persistence/cleanup-scheduler.ts
export class CleanupScheduler {
  private running = false;
  
  start(): void {
    if (this.running) return;
    this.running = true;
    
    // Run cleanup every 24 hours
    setInterval(() => this.cleanupOldData(), 24 * 60 * 60 * 1000);
    
    // Run immediately on startup
    this.cleanupOldData();
  }
  
  private async cleanupOldData(): Promise<void> {
    try {
      console.log('[Cleanup] Starting data retention cleanup...');
      
      const deleted_metrics = await DataPersistence.deleteOldMetrics(90);  // 90-day retention
      const deleted_alerts = await DataPersistence.deleteOldAlerts(48);    // 48-hour retention
      
      console.log(`[Cleanup] Deleted ${deleted_metrics} metrics, ${deleted_alerts} alerts`);
    } catch (error) {
      console.error('[Cleanup] Failed:', error);
    }
  }
}

export default new CleanupScheduler();
```

```typescript
// src/index.ts (add after persistence init)
import {default as cleanupScheduler} from './persistence/cleanup-scheduler.js';
cleanupScheduler.start();
```

---

## Consistency Issues

### FINDING: No Transactions for Multi-Collection Writes

**Severity:** 🟡 MEDIUM  
**Impact:** KB and audit log can be out-of-sync  

**Scenario:**
```
Operation: Save new KB entry + audit log about it
Write 1: kb_entry inserted successfully
Write 2: audit_log insert fails (quota exceeded)

Result:
- KB has entry
- Audit log doesn't reflect addition
- System inconsistent, no way to recover
```

**Minimal Fix (1.5 hours):**

```typescript
async saveKBEntryWithAudit(entry: KBEntry, actorId: string): Promise<void> {
  const session = mongoClient.startSession();
  try {
    await session.withTransaction(async () => {
      const kbCol = db.collection('knowledge_base');
      const auditCol = db.collection('audit_logs');
      
      await kbCol.insertOne(entry, { session });
      await auditCol.insertOne({
        action: 'kb_entry_created',
        actor: actorId,
        resource: entry.id,
        timestamp: new Date(),
        changes: entry
      }, { session });
    });
  } finally {
    await session.endSession();
  }
}
```

---

## Index Corruption

### FINDING: Index Creation Errors Silently Swallowed

**Severity:** 🟡 MEDIUM  
**Impact:** Queries slow (missing indexes), silent degradation  

**Evidence:**
```typescript
try {
  await metricsCol.createIndex({ timestamp: -1 });
} catch (error) {
  console.error('[MongoDB] ⚠️  Index creation failed:', error);
  // Don't throw - continues with missing index!
}
```

**Minimal Fix:**
```typescript
try {
  await metricsCol.createIndex({ timestamp: -1 });
  console.log('[MongoDB] Index created: metrics.timestamp');
} catch (error) {
  // Only ignore "already exists" errors
  if (!error.message.includes('already exists')) {
    throw new Error(`[Critical] Failed to create index: ${error.message}`);
  }
}
```

---

## Data Export Correctness

### FINDING: Export Endpoint Returns Counts, Not Actual Data

**Severity:** 🟡 MEDIUM  
**Impact:** Backup shows counts but doesn't include actual documents  

**Evidence:**
```json
{
  "collections": {
    "metrics": 15000,
    "alerts": 8000
  }
}
```

**Fix:** Add option to export actual data for backup:
```typescript
app.get("/api/persistence/export", async (req, res) => {
  const includeData = req.query.includeData === 'true';
  
  if (includeData) {
    // Stream large dataset instead of loading all in memory
    res.type('application/x-ndjson');
    
    const collections = ['metrics', 'alerts', 'knowledge_base'];
    for (const collName of collections) {
      const cursor = db.collection(collName).find({});
      for await (const doc of cursor) {
        res.write(JSON.stringify(doc) + '\n');
      }
    }
    res.end();
  } else {
    // Return stats only (existing behavior)
    res.json(await PersistenceIntegration.exportAllData());
  }
});
```

---

## Summary

| Issue | Severity | Fix Time | Impact |
|-------|----------|----------|--------|
| No schema validation | 🟡 | 1h | Invalid docs |
| No migrations | 🔴 | 3h | Schema corruption |
| Retention not enforced | 🟡 | 1.5h | Unbounded growth |
| No multi-doc transactions | 🟡 | 1.5h | Inconsistent state |
| Index errors silent | 🟡 | 0.5h | Query degradation |
| Export missing data | 🟡 | 1h | Incomplete backups |

**Total:** 8.5 hours
