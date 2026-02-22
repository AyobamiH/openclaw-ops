# HEARTBEAT - Periodic Health Checks

## Health Checks (Every 10 minutes)

### 1. Disk Access Check
- Can read workspace directory?
- Can write patch files to /tmp?

✓ **Pass**: Both paths accessible
✗ **Fail**: Any path inaccessible

### 2. Skill Access Check
- `workspacePatch` skill available?
- `testRunner` skill available?

✓ **Pass**: Both skills registered and callable
✗ **Fail**: Either skill missing or disabled

### 3. Test Environment Check
- Can execute test suite?
- Test runner responsive?

✓ **Pass**: Tests run in <5 min
✗ **Fail**: Test timeout or runner crash

### 4. Git Repository Check
- Git repository initialized?
- Can generate diffs?

✓ **Pass**: Git available, diffs clean
✗ **Fail**: Git error or corrupted repository

## Failure Escalation

- 1st failure: Log warning
- 2nd failure (1 hour): Log error
- 3rd failure (2 hours): Alert orchestrator
