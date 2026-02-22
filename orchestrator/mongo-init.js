// MongoDB Initialization Script
// Runs automatically when MongoDB container starts
// Creates collections, indexes, and initial data

const db = db.getSiblingDB('orchestrator');

// Create orchestrator user (if root auth is enabled)
db.createUser({
  user: 'orchestrator',
  pwd: process.env.MONGO_PASSWORD || 'orchestrator-dev',
  roles: [
    { role: 'readWrite', db: 'orchestrator' }
  ]
});

// Create agents collection with unique index
db.createCollection('agents', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'name', 'status'],
      properties: {
        id: { bsonType: 'string' },
        name: { bsonType: 'string' },
        status: { enum: ['idle', 'running', 'error'] },
        tier: { enum: ['cheap', 'balanced'] },
        model: { bsonType: 'string' },
        uptime: { bsonType: 'long' },
        taskCount: { bsonType: 'int' },
        errorCount: { bsonType: 'int' },
        lastUpdated: { bsonType: 'date' }
      }
    }
  }
});

db.agents.createIndex({ id: 1 }, { unique: true });
db.agents.createIndex({ status: 1 });
db.agents.createIndex({ tier: 1 });
db.agents.createIndex({ lastUpdated: -1 });

// Create tasks collection
db.createCollection('tasks', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'agentId', 'skillId', 'status'],
      properties: {
        id: { bsonType: 'string' },
        agentId: { bsonType: 'string' },
        skillId: { bsonType: 'string' },
        status: { enum: ['pending', 'running', 'completed', 'failed'] },
        traceId: { bsonType: 'string' },
        parentTraceId: { bsonType: 'string' },
        input: { bsonType: 'object' },
        output: { bsonType: 'object' },
        error: { bsonType: 'string' },
        startedAt: { bsonType: 'date' },
        completedAt: { bsonType: 'date' },
        duration: { bsonType: 'long' },
        cost: { bsonType: 'double' }
      }
    }
  }
});

db.tasks.createIndex({ id: 1 }, { unique: true });
db.tasks.createIndex({ traceId: 1 });
db.tasks.createIndex({ status: 1 });
db.tasks.createIndex({ agentId: 1 });
db.tasks.createIndex({ completedAt: -1 });
db.tasks.createIndex({ startedAt: 1 }, { expireAfterSeconds: 2592000 }); // Auto-delete after 30 days

// Create audit collection (immutable)
db.createCollection('auditLog', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['traceId', 'action', 'agentId', 'timestamp'],
      properties: {
        _id: { bsonType: 'objectId' },
        traceId: { bsonType: 'string' },
        parentTraceId: { bsonType: 'string' },
        action: { enum: ['task_started', 'task_completed', 'task_failed', 'permission_denied', 'approval_requested', 'approval_granted', 'approval_rejected', 'error_recovered'] },
        agentId: { bsonType: 'string' },
        skillId: { bsonType: 'string' },
        status: { bsonType: 'string' },
        timestamp: { bsonType: 'date' },
        duration: { bsonType: 'long' },
        metadata: { bsonType: 'object' }
      }
    }
  }
});

db.auditLog.createIndex({ traceId: 1 });
db.auditLog.createIndex({ parentTraceId: 1 });
db.auditLog.createIndex({ agentId: 1 });
db.auditLog.createIndex({ action: 1 });
db.auditLog.createIndex({ timestamp: 1 });
db.auditLog.createIndex({ timestamp: 1 }, { expireAfterSeconds: 7776000 }); // Auto-delete after 90 days

// Create approval requests collection
db.createCollection('approvalRequests', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'taskId', 'status', 'createdAt'],
      properties: {
        id: { bsonType: 'string' },
        taskId: { bsonType: 'string' },
        traceId: { bsonType: 'string' },
        status: { enum: ['pending', 'approved', 'rejected'] },
        createdAt: { bsonType: 'date' },
        decidedAt: { bsonType: 'date' },
        decidedBy: { bsonType: 'string' },
        reason: { bsonType: 'string' },
        turnaroundTime: { bsonType: 'long' }
      }
    }
  }
});

db.approvalRequests.createIndex({ id: 1 }, { unique: true });
db.approvalRequests.createIndex({ taskId: 1 });
db.approvalRequests.createIndex({ status: 1 });
db.approvalRequests.createIndex({ createdAt: 1 });
db.approvalRequests.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // Auto-delete after 30 days

// Create metrics collection (time-series)
db.createCollection('metrics', {
  timeseries: {
    timeField: 'timestamp',
    metaField: 'metadata',
    granularity: 'minutes'
  }
});

db.metrics.createIndex({ 'metadata.agentId': 1, timestamp: -1 });
db.metrics.createIndex({ timestamp: 1 }, { expireAfterSeconds: 2592000 }); // Auto-delete after 30 days

// Create costs collection for billing/tracking
db.createCollection('costs', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id', 'agentId', 'taskId', 'amount'],
      properties: {
        id: { bsonType: 'string' },
        agentId: { bsonType: 'string' },
        taskId: { bsonType: 'string' },
        skillId: { bsonType: 'string' },
        model: { bsonType: 'string' },
        amount: { bsonType: 'double' },
        currency: { bsonType: 'string' },
        timestamp: { bsonType: 'date' }
      }
    }
  }
});

db.costs.createIndex({ agentId: 1 });
db.costs.createIndex({ taskId: 1 });
db.costs.createIndex({ timestamp: 1 });
db.costs.createIndex({ timestamp: 1 }, { expireAfterSeconds: 7776000 }); // Auto-delete after 90 days

// Create sessions collection
db.createCollection('sessions', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['sessionId', 'userId', 'createdAt'],
      properties: {
        sessionId: { bsonType: 'string' },
        userId: { bsonType: 'string' },
        token: { bsonType: 'string' },
        createdAt: { bsonType: 'date' },
        expiresAt: { bsonType: 'date' },
        lastActivity: { bsonType: 'date' }
      }
    }
  }
});

db.sessions.createIndex({ sessionId: 1 }, { unique: true });
db.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Create permissions cache
db.createCollection('permissionsCache', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['agentId', 'skillId'],
      properties: {
        agentId: { bsonType: 'string' },
        skillId: { bsonType: 'string' },
        allowed: { bsonType: 'bool' },
        maxCalls: { bsonType: 'int' },
        ttl: { bsonType: 'date' }
      }
    }
  }
});

db.permissionsCache.createIndex({ agentId: 1, skillId: 1 }, { unique: true });
db.permissionsCache.createIndex({ ttl: 1 }, { expireAfterSeconds: 0 });

// Insert initial agent configurations
db.agents.insertMany([
  { id: 'market-research-agent', name: 'Market Research', status: 'idle', tier: 'cheap', model: 'gpt-4o-mini', uptime: 0, taskCount: 0, errorCount: 0, lastUpdated: new Date() },
  { id: 'data-extraction-agent', name: 'Data Extraction', status: 'idle', tier: 'cheap', model: 'gpt-4o-mini', uptime: 0, taskCount: 0, errorCount: 0, lastUpdated: new Date() },
  { id: 'qa-verification-agent', name: 'QA Verification', status: 'idle', tier: 'cheap', model: 'gpt-4o-mini', uptime: 0, taskCount: 0, errorCount: 0, lastUpdated: new Date() },
  { id: 'summarization-agent', name: 'Summarization', status: 'idle', tier: 'cheap', model: 'gpt-4o-mini', uptime: 0, taskCount: 0, errorCount: 0, lastUpdated: new Date() },
  { id: 'build-refactor-agent', name: 'Build & Refactor', status: 'idle', tier: 'cheap', model: 'gpt-4o-mini', uptime: 0, taskCount: 0, errorCount: 0, lastUpdated: new Date() },
  { id: 'security-review-agent', name: 'Security Review', status: 'idle', tier: 'cheap', model: 'gpt-4o-mini', uptime: 0, taskCount: 0, errorCount: 0, lastUpdated: new Date() },
  { id: 'content-normalization-agent', name: 'Content Normalization', status: 'idle', tier: 'balanced', model: 'claude-3-5-sonnet', uptime: 0, taskCount: 0, errorCount: 0, lastUpdated: new Date() },
  { id: 'content-creation-agent', name: 'Content Creation', status: 'idle', tier: 'balanced', model: 'claude-3-5-sonnet', uptime: 0, taskCount: 0, errorCount: 0, lastUpdated: new Date() },
  { id: 'integration-orchestration-agent', name: 'Integration Orchestration', status: 'idle', tier: 'balanced', model: 'claude-3-5-sonnet', uptime: 0, taskCount: 0, errorCount: 0, lastUpdated: new Date() },
  { id: 'skill-audit-agent', name: 'Skill Audit', status: 'idle', tier: 'balanced', model: 'claude-3-5-sonnet', uptime: 0, taskCount: 0, errorCount: 0, lastUpdated: new Date() },
  { id: 'system-monitor-agent', name: 'System Monitor', status: 'idle', tier: 'balanced', model: 'claude-3-5-sonnet', uptime: 0, taskCount: 0, errorCount: 0, lastUpdated: new Date() }
]);

print('✅ MongoDB initialization complete');
print('   - 11 agents created');
print('   - 8 collections created');
print('   - Indexes created');
print('   - Time-series setup complete');
