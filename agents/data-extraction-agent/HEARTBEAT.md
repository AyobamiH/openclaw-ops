# HEARTBEAT - Periodic Health Checks

## Health Checks (Every 5 minutes)

### 1. Disk Access Check
- Can read from workspace directory?
- Can write to /tmp?

✓ **Pass**: Both read/write paths accessible
✗ **Fail**: Any path inaccessible

### 2. Skill Access Check
- `documentParser` skill available?
- `normalizer` skill available?

✓ **Pass**: Both skills registered and callable
✗ **Fail**: Either skill missing or disabled

### 3. Performance Check
- Average parse time per document?
- Errors per hour?

✓ **Pass**: <10 sec per document, <2% error rate
✗ **Fail**: Slow parsing or high errors

## Failure Escalation

- 1st failure: Log warning
- 2nd failure (30 min): Log error
- 3rd failure (1 hour): Alert orchestrator
