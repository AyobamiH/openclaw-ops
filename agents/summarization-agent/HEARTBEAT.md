# HEARTBEAT - Periodic Health Checks

## Health Checks (Every 5 minutes)

### 1. Disk Access Check
- Can read from workspace directory?
- Can write temporary summarization cache?

✓ **Pass**: Both read/write paths accessible
✗ **Fail**: Any path inaccessible

### 2. Skill Access Check
- `documentParser` skill available?
- `normalizer` skill available?

✓ **Pass**: Both skills registered and callable
✗ **Fail**: Either skill missing or disabled

### 3. Performance Check
- Average compression ratio?
- Errors per hour?

✓ **Pass**: ≥5:1 compression ratio, <2% error rate
✗ **Fail**: Poor compression or high errors

### 4. Model Availability Check
- Can call gpt-4o-mini model?
- API quota available?

✓ **Pass**: Model responds, quota healthy
✗ **Fail**: Model timeout or quota exceeded

## Failure Escalation

- 1st failure: Log warning
- 2nd failure (30 min): Log error
- 3rd failure (1 hour): Alert orchestrator
