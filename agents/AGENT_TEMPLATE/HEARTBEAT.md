# HEARTBEAT - Periodic Checks & Monitoring

This file defines what the agent checks during periodic heartbeats while running.

## Heartbeat Schedule

Runs every **5 minutes** (configurable in agent.config.json)

## Health Checks

### 1. Liveness Check
- Is the agent process still running?
- Can it respond to ping?
- Memory usage normal?

✓ **Pass**: Process running, <512MB memory, responds in <100ms
✗ **Fail**: Process hung, memory leak, or unresponsive

### 2. Skill Access Check
- Are all required skills still registered and accessible?
- Can the agent call allowed skills?

✓ **Pass**: All allowed skills available
✗ **Fail**: Skill registry unavailable or skill missing

### 3. Network Check (if applicable)
- Can the agent reach allowlisted domains?
- DNS resolution working?

✓ **Pass**: Can reach allowed domains in <2 sec
✗ **Fail**: Network unreachable or timeout

### 4. Configuration Check
- Is agent.config.json still valid?
- Have permissions changed?

✓ **Pass**: Config valid, permissions unchanged
✗ **Fail**: Config error or unexpected permission change

## Failure Escalation

**First failure:** Log warning
**Second failure (within 30 min):** Log error
**Third failure (within 1 hour):** Escalate to orchestrator alert
**Continuous failure (>1 hour):** Auto-restart agent

## Alert Destinations

Failures are reported to:
1. Agent log file: `logs/agents/[agent-id].log`
2. Orchestrator dashboard: `/api/agents/[agent-id]/alerts`
3. System administrator (if critical)

## Manual Health Check

Run this to manually trigger health checks:

```bash
curl -X POST http://localhost:3000/api/agents/[agent-id]/heartbeat
```

Expected response:
```json
{
  "agentId": "my-agent",
  "timestamp": "2026-02-22T10:30:00Z",
  "checks": [
    {
      "name": "liveness",
      "status": "pass",
      "message": "Process healthy"
    },
    {
      "name": "skill-access",
      "status": "pass",
      "message": "5 skills available"
    }
  ],
  "passed": true
}
```

## Customization

Add custom health checks for your agent:

### Example: Custom Database Check

```typescript
// In src/index.ts
async function checkDatabaseConnection(): Promise<HealthCheck> {
  const result = await pool.query('SELECT 1');
  return {
    name: 'database',
    status: result ? 'pass' : 'fail',
    message: result ? 'Connected' : 'Connection failed'
  };
}
```

## Metrics Collected

During each heartbeat:
- Memory usage (RSS, heapUsed)
- CPU percentage
- Last task completed
- Total tasks since startup
- Error rate (errors/total)
- Average task duration

View these metrics:
```bash
curl http://localhost:3000/api/agents/[agent-id]/metrics?hours=1
```
