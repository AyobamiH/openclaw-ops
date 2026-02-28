# PRD: OpenClaw Governance Remediation (Feb 23, 2026)

**Status**: Foundation audit complete. 3 critical governance gaps identified. This PRD prevents scope drift.

---

## 1. Critical Gaps (Must Fix - Blocking)

### Gap 1: Missing Runtime ToolGate
**Claim**: Deny-by-default permission enforcement at skill execution
**Reality**: `toolGate.ts` absent from orchestrator runtime
**Impact**: No runtime skill access control; relies only on agent-side validation
**Fix**: 
- Create `orchestrator/src/skills/toolGate.ts` (80-120 LOC)
- Enforce agent skill allowlist at runtime before any skill exec
- Audit every denied access attempt

**Severity**: ⚠️ Critical (all permissions are advisory-only today)

---

### Gap 2: Missing Runtime SkillAudit
**Claim**: Startup skill configuration validation gate
**Reality**: `orchestrator/src/skillAudit.ts` doesn't exist; `skills/index.ts` imports broken path
**Impact**: Invalid/misconfigured skills load silently
**Fix**:
- Create `orchestrator/src/skillAudit.ts` with startup validation (60-100 LOC)
- Validate skill config format, permission matrix completeness
- Hard-fail on misconfiguration

**Severity**: ⚠️ Critical (silent failures on startup)

---

### Gap 3: Orchestrator Not Sole Dispatch Authority
**Claim**: All agent execution routed through orchestrator only
**Reality**: Standalone systemd units exist for `doc-specialist` and `reddit-helper` 
**Impact**: These agents can execute outside queue + audit policy
**Fix**:
- Remove standalone service deployment for both agents
- Route all invocations through orchestrator task triggers
- Update compose/systemd configs to enforce orchestrator-only mode

**Severity**: ⚠️ Critical (governance boundary violated)

---

## 2. High-Priority Gaps (Structural Risk)

### Gap 4: Unknown Task Fallback Accepts Instead of Rejects
**Claim**: Task routing is strict + audited
**Reality**: `taskHandlers.ts` fallback returns success message for unknown types
**Impact**: Invalid task types silently added to queue; no audit trail of failure
**Fix**:
- Change unknown task fallback to explicit error + reject
- Emit security/audit metric for each unknown attempt
- Return structured error (not success message)

**Severity**: 🟡 High (governance visibility gap)

---

### Gap 5: Control Plane Task Allowlist Not Enforced at Enqueue
**Claim**: Only valid tasks accepted into queue
**Reality**: `TaskQueue.enqueue()` has no allowlist guard; internal code can add any task type
**Impact**: Internal queue pollution possible; divergence between API schema and actual queue
**Fix**:
- Add `ALLOWED_TASK_TYPES` enum derived from `taskHandlers` keys
- Validate task type against enum at `TaskQueue.enqueue()` entry point
- Reject unknown task types with audit event before queue acceptance

**Severity**: 🟡 High (queue consistency)

---

### Gap 6: Standalone Services Bypass Audit Traceability
**Claim**: All agent executions traceable to queue task ID
**Reality**: Standalone systemd services can execute agents without queue context
**Impact**: Executions missing from task history + audit logs
**Fix**:
- Make standalone service invocation route through orchestrator (via HTTP POST /api/tasks/trigger)
- Remove direct agent startup capability
- Update systemd units to run healthcheck/monitor mode only, not execution mode

**Severity**: 🟡 High (audit/traceability)

---

## 3. Medium-Priority Gaps (Policy / Operational)

### Gap 7: No API Key Rotation Framework
**Claim**: Auth is secure + rotatable
**Reality**: Static token comparison; no key expiration or rotation mechanism in code
**Impact**: Compromised key requires code deployment to remedy
**Fix**:
- Add key versions + expiration timestamps to auth config
- Implement 90-day rotation policy in startup (warn if expired)
- Support multiple active keys during rotation window

**Severity**: 🟠 Medium (ops friction)

---

### Gap 8: Webhook Signature Canonicalization Undocumented
**Claim**: Webhook signatures validated securely
**Reality**: `JSON.stringify(req.body)` used; signing depends on upstream canonicalization
**Impact**: Signature mismatches if upstream changes JSON order
**Fix**:
- Document webhook signing contract with upstream (AlertManager)
- Use canonical JSON representation (sorted keys)
- Add test case with alternate key orderings

**Severity**: 🟠 Medium (reliability)

---

### Gap 9: Integration Tests Mock Runtime Instead of Validating
**Claim**: Full integration tests ensure runtime safety
**Reality**: Tests use fixtures/simulations; don't invoke actual toolGate/middleware
**Impact**: Tests pass while runtime fails
**Fix**:
- Rewrite integration tests to spawn real orchestrator process
- Validate actual middleware chain (auth, validation, rate limits)
- Test denied permission scenarios end-to-end
- Mark old fixture tests as unit tests only

**Severity**: 🟠 Medium (test validity)

---

## 4. Scope Boundaries (OUT OF SCOPE FOR THIS PRD)

❌ **Not included** (separate future work):
- New agent templates or skills
- Feature expansion (new capabilities)
- Performance optimization
- UI/UX enhancements

✅ **Fully scoped** (governance remediation only):
- Runtime permission enforcement
- Audit traceability
- Configuration validation
- Deployment mode enforcement

---

## 5. Implementation Order (Dependency Chain)

```
Phase 1: Implement Runtime Controls
  ├─ skillAudit.ts (prerequisite for all)
  ├─ toolGate.ts (enforces permissions)
  └─ Task allowlist enum (queue validation)

Phase 2: Enforce Governance Boundaries
  ├─ Unknown task fallback → error
  ├─ Remove standalone service deployments
  └─ Route all exec through orchestrator

Phase 3: Validation & Operational Hardening
  ├─ Rewrite integration tests (real runtime)
  ├─ Key rotation framework
  └─ Webhook canonicalization doc + test
```

---

## 6. Success Criteria

- ✅ All 6 invariants now compliant (verified in code + runtime test)
- ✅ Zero claims/reality gaps in OPENCLAW_KB audit re-run
- ✅ Integration tests validate actual runtime controls (not mocks)
- ✅ Unknown task attempts generate audit events + reject
- ✅ No operational path to bypass orchestrator dispatch
- ✅ All skill executions traceable to queue task ID + agent identity

---

## 7. Effort Estimate

| Phase | Gap | Lines | Hours | Risk |
|-------|-----|-------|-------|------|
| 1 | skillAudit.ts | 80 | 1 | Low |
| 1 | toolGate.ts | 120 | 1.5 | Medium |
| 1 | Task allowlist | 40 | 0.5 | Low |
| 2 | Error fallback | 30 | 0.5 | Low |
| 2 | Remove standalone services | 20 | 0.5 | Medium |
| 2 | Orchestrator-only enforcement | 60 | 1 | Medium |
| 3 | Integration test rewrite | 300 | 3 | High |
| 3 | Key rotation framework | 100 | 1.5 | Medium |
| 3 | Webhook canonicalization | 50 | 0.5 | Low |
| **Total** | — | ~780 | **9-10 hours** | — |

---

## 8. Decision Point

**Go / No-Go**: Fix all critical + high gaps before next feature development?

**Recommendation**: ✅ **GO** — Governance foundation is prerequisite for scaling. 9 hours << cost of shipped code with broken permissions.

---

_Generated: 2026-02-23_  
_Source: OPENCLAW_KB audit (00-08)_  
_Scope lock: No additions until gaps resolved_
