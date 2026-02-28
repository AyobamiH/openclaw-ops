# HEARTBEAT - Periodic Health Checks

## Health Checks (Every 5 minutes)

### 1. Test Command Access Check
- Can execute whitelisted test commands?
- All 7 test runners (jest, mocha, vitest, pytest, unittest, cargo test, go test) available if needed?

✓ **Pass**: Test execution available and responsive
✗ **Fail**: Cannot execute or commands blocked

### 2. Skill Access Check
- `testRunner` skill available?

✓ **Pass**: Skill registered and callable
✗ **Fail**: Skill missing or disabled

### 3. Performance Check
- Average test suite run time?
- Pass rate across runs?

✓ **Pass**: <5 min per full suite, >95% pass rate
✗ **Fail**: Slow runs or failing tests

## Failure Escalation

- 1st failure: Log warning
- 2nd failure (30 min): Log error
- 3rd failure (1 hour): Alert orchestrator
