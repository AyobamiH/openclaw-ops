# HEARTBEAT - Periodic Health Checks

## Health Checks (Every 5 minutes)

### 1. Network Access Check
- Can reach github.com?
- Can reach openai.com?
- All allowlisted domains responsive?

✓ **Pass**: All domains reachable in <2 sec
✗ **Fail**: Any domain timeout or unreachable

### 2. Skill Access Check
- `sourceFetch` skill available?

✓ **Pass**: Skill registered and callable
✗ **Fail**: Skill missing or disabled

### 3. Performance Check
- Average fetch time?
- Errors per hour?

✓ **Pass**: <2 sec per fetch, <5% error rate
✗ **Fail**: Slow fetches or high errors

## Failure Escalation

- 1st failure: Log warning
- 2nd failure (30 min): Log error
- 3rd failure (1 hour): Alert orchestrator
