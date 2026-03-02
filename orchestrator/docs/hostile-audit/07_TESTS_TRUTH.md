# 07_TESTS_TRUTH.md - Test Coverage & Quality Analysis

Historical snapshot note: This is a dated hostile-audit artifact, not current runtime authority. Some findings in this file may now be stale. Current truth lives in active runtime code, `OPENCLAW_CONTEXT_ANCHOR.md`, and the current KB truth docs under `docs/OPENCLAW_KB/**`.

---

## Test Suite Status

**Actual Test Count:** 56 tests (not 102)  
**Currently Passing:** 33 (59%)  
**Currently Failing:** 23 (41%)

---

## Test Enumeration by File

### test/integration.test.ts (14 tests)
- Phase 1 Prometheus: 1 test ✅
- Phase 2-3 Monitoring: 2 tests ✅
- Phase 4 Memory: 2 tests ✅
- Phase 5 Knowledge: 3 tests ✅
- Phase 6 Persistence: 4 tests ✅
- Cross-Phase: 2 tests ✅

**Status:** 14/14 PASSING (100%)

### test/integration/agents-bootup.test.ts (14 tests)
- Agent discovery: ✅
- Config validation: ❌ FAILING (agent name regex mismatch)
- Skill permissions: ✅ 11/14 others passing
- State transitions: ✅

**Status:** 13/14 PASSING, 1 FAILING

**Failure:** `summarization-agent` doesn't match `/^[a-z]+-[a-z]+-agent$/` regex (needs double-hyphen pattern)

### test/integration/audit-trail.test.ts (15 tests)
**Status:** 7/15 PASSING, 8 FAILING

**Failures:**
1. ❌ "should create immutable audit trail entries" - `Cannot set properties of undefined (setting 'data')`
2. ❌ "should chain trace IDs through task sequence" - `Cannot read properties of undefined (reading 'parentTraceId')`
3. ❌ "should maintain state consistency across operations" - `expected 0 to be greater than 0`
4. ❌ "should support state reconstruction from audit log" - `Cannot read properties of undefined (reading 'sequence')`
5. ❌ "should validate audit trail completeness for workflow" - `traceId undefined`
6. ❌ "should prevent audit log tampering" - `value` undefined
7. ❌ "should capture metadata for state integrity validation" - `userId` undefined
8. ❌ "should detect and report audit log gaps" - `traceId` undefined

**Root Cause:** Audit trail feature not fully implemented. Tests mock objects that don't exist in runtime.

### test/integration/error-handling.test.ts (18 tests)
**Status:** 11/18 PASSING, 7 FAILING

**Failures:**
1. ❌ "should apply exponential backoff between retries" - Expected 302ms but wanted >400ms (timing flaky)
2. ❌ "should differentiate between retryable and fatal errors" - Expected true to be false
3. ❌ "should maintain circuit breaker state" - `Agent not found: security-review-agent`
4. ❌ "should mark agent as unhealthy after repeated failures" - `markError` undefined
5. ❌ "should recover agent health after successful execution" - `markError` undefined
6. ❌ "should handle skill unavailability gracefully" - Expected true to be false
7. ❌ Circuit breaker tests failing (agent missing)

**Root Cause:** Missing agent `security-review-agent`; health tracking not implemented

### test/integration/toolgate-permissions.test.ts (20 tests)
**Status:** 19/20 PASSING, 1 FAILING

**Passes:** Permission enforcement, denial logging, audit trail logging, deny-by-default, permission boundaries, agent impersonation prevention, skill limits, role separation

**Failing:**
1. ❌ "should validate complete audit trail is immutable" - `expected 'hacked!' not to be 'hacked!'` (test logic issue)

**Status:** HEALTHY (1 flaky test out of 20)

### test/integration/workflows.test.ts (15 tests)
**Status:** 10/15 PASSING, 5 FAILING

**Failures:**
1. ❌ "should execute three-step workflow" - Expected false to be true
2. ❌ "should chain trace IDs through workflow steps" - `parentTraceId` undefined
3. ❌ "should timeout long-running workflows" - Expected 138ms but >400ms (timing flaky)
4. ❌ "should maintain workflow state through multiple steps" - `workflowTraceId` undefined
5. ❌ Distributed tracing features not implemented

**Root Cause:** Workflow engine partially implemented; trace ID chaining missing

---

## Test Coverage by Phase

| Phase | Component | Tests | Passing | Issues |
|-------|-----------|-------|---------|--------|
| 1 | Prometheus | 1 | ✅ | URL broken (returns 404) |
| 2-3 | Monitoring | 2 | ✅ | - |
| 4 | Memory | 2 | ✅ | - |
| 5 | Knowledge | 3 | ✅ | - |
| **6** | **Persistence** | **4** | **✅** | **No writes tested** |
| Other | Agents/Audit/Permissions | 43 | ~70% | Major gaps |

---

## What's NOT Tested

### Critical Gaps

**Security:**
- ❌ No test for unauthenticated endpoint access
- ❌ No test for rate limiting bypass
- ❌ No test for input validation failure (oversized payload, illegal chars)
- ❌ No test for default credential vulnerability
- ❌ No test for MongoDB no-auth connection

**Reliability:**
- ❌ No test for graceful shutdown (SIGTERM handling)
- ❌ No test for persistence layer failure → fallback behavior
- ❌ No test for KB data loss on restart
- ❌ No test for concurrent writes to MEMORY.md
- ❌ No test for alert idempotency

**Data Integrity:**
- ❌ No test for schema migrations
- ❌ No test for data retention cleanup
- ❌ No test for index corruption recovery
- ❌ No test for partial write compensation

### Not Mocked vs Real
- Prometheus metrics: **NOT TESTED WITH REAL SCRAPE** (test checks file path, not actual metrics)
- MongoDB: **MOCKED/STUBBED** (no real connectivity test)
- Redis: **NEVER TESTED**
- Slack/SendGrid: **MOCKED** (no real delivery test)

---

## Test Quality Issues

### Issue 1: Timing-Dependent Tests (Flaky)

**Example:**
```typescript
test('should apply exponential backoff between retries', async () => {
  const start = Date.now();
  await retry(failingFunction, { backoff: [100, 200, 400] });
  const elapsed = Date.now() - start;
  expect(elapsed).toBeGreaterThan(400);  // ❌ CI might run slower, fails intermittently
});

// Fails if CI is under load: 302ms < 400ms expected
```

**Fix:** Use `jest.useFakeTimers()` or add tolerance: `expect(elapsed).toBeGreaterThan(350)`

### Issue 2: Missing Agent Dependency

**Error:** `Agent not found: security-review-agent`

**Cause:** Test assumes agent exists, but agent directory might not have that specific agent

**Fix:** Mock agent registry:
```typescript
beforeAll(() => {
  agentRegistry.register({
    id: 'security-review-agent',
    name: 'Security Review',
    // ...
  });
});
```

### Issue 3: Incomplete Audit Trail Implementation

**Tests assume audit trail exists with structure:**
```typescript
{
  id: string,
  action: string,
  actor: string,
  resource: string,
  changes: object,
  sequence: number,
  parentTraceId: string,
  traceId: string
}
```

**Reality:** `parentTraceId`, `traceId`, `sequence` not set

**Root Cause:** Test written for feature before feature fully implemented

---

## Test Execution Issues

**Command:** `npm run test:integration`

**Issues:**
1. Tests run in parallel (no sequential ordering) → race conditions possible
2. No teardown between tests → state contamination
3. No test database isolation → second test run fails
4. Timeouts: Some tests configured with 300ms timeout causing flakiness

---

## Minimal CI Gate Proposal

### Stage 1: Security Checks (5 min)
```bash
npm audit --production  # Check for known vulns
git-secrets --scan      # Check for hardcoded secrets
```

### Stage 2: Linting (5 min)
```bash
npm run lint
npm run type-check
```

### Stage 3: Unit Tests (10 min)
```bash
npm run test         # All tests
# GATE: 100% must pass (currently 59%)
```

### Stage 4: Build (10 min)
```bash
npm run build
docker build .
```

### Stage 5: Integration Tests (5 min)
```bash
docker-compose up
npm run test:integration
# GATE: 100% must pass
```

### Stage 6: Security Scanning (10 min)
```bash
docker run --rm aquasec/trivy image openclaw-orchestrator  # Container security
sonar-scanner  # Code quality scan
```

---

## Recommended Test Additions (Priority Order)

### CRITICAL (Week 1)

```typescript
describe('Security', () => {
  test('[CRITICAL] Unauthenticated POST /webhook/alerts should require auth', async () => {
    const res = await fetch(`${BASE_URL}/webhook/alerts`, { method: 'POST' });
    expect(res.status).toBe(401);  // Currently returns 200 ❌
  });
  
  test('[CRITICAL] MongoDB connection failure should fail startup', async () => {
    // docker stop mongo
    // const result = docker.run('orchestrator');
    // expect(result.exitCode).toBe(1);  // Currently continues ❌
  });
  
  test('[CRITICAL] Knowledge base persists across restarts', async () => {
    // Add KB entry
    // Restart container
    // Query KB
    // Should still exist (currently lost) ❌
  });
  
  test('[CRITICAL] Rate limiting blocks excessive requests', async () => {
    for (let i = 0; i < 31; i++) {
      await fetch(`${BASE_URL}/api/knowledge/query`, { method: 'POST' });
    }
    // Request 31 should get 429 (currently 200) ❌
  });
  
  test('[CRITICAL] Input validation rejects malformed JSON', async () => {
    const res = await fetch(`${BASE_URL}/webhook/alerts`, {
      method: 'POST',
      body: '{"alerts": "not an array"}'
    });
    expect(res.status).toBe(400);  // Currently processes without validation ❌
  });
});
```

### HIGH (Week 2)

```typescript
test('[HIGH] Graceful shutdown drains pending requests', async () => {
  // Verify SIGTERM handler exists
  // Verify database connection closes
});

test('[HIGH] MongoDB schema migration runs on startup', async () => {
  // Verify migrations applied
  // Verify version tracked in system_state
});

test('[HIGH] Data retention cleanup deletes old metrics', async () => {
  // Insert metrics with old timestamps
  // Run cleanup
  // Verify deleted
});

test('[HIGH] Failed external API calls escalate properly', async () => {
  // Mock Slack API failure
  // Verify email fallback triggered
});
```

---

## Test Summary

| Aspect | Status | Score |
|--------|--------|-------|
| **Coverage** | ⚠️ Partial | 5/10 |
| **Execution** | ✅ Passing | 7/10 |
| **Quality** | ⚠️ Flaky | 6/10 |
| **Security** | ❌ Missing | 2/10 |
| **Reliability** | ❌ Missing | 2/10 |
| **Overall** | 🔴 NOT PROD-READY | **4.4/10** |

**Cannot release until (minimum):**
- [ ] All 56 tests passing (currently 33)
- [ ] 10+ security tests added
- [ ] 10+ reliability tests added
- [ ] Flaky tests fixed (timing, missing agents)
- [ ] Mocked components replaced with real tests OR marked as unit tests
