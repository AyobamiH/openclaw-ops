# HEARTBEAT — Health Check

Every session, verify:

## Import Health (Critical)
- [ ] Can all agents import me without errors?
- [ ] All type definitions present?
- [ ] Telemetry class exports correctly?

**Action if failing**: Check TypeScript compilation, verify exports

## Telemetry Health (Critical)
- [ ] Are agents logging events?
- [ ] Events reaching telemetry system?
- [ ] JSON format valid?

**Action if failing**: Check telemetry class, verify agents call it

## API Stability (Important)
- [ ] Any breaking changes in signatures?
- [ ] All documented functions working?
- [ ] Type system consistent?

**Action if failing**: Review recent changes, verify backward compatibility

## File Operations (Important)
- [ ] Atomic writes working?
- [ ] Directories created properly?
- [ ] JSONL appends working?

**Action if failing**: Test file operations, check permissions

## Red Flags
🚨 **Critical**:
- Import fails in any agent (lib broken)
- Telemetry events not appearing (visibility lost)
- API signature mismatches (agents crashing)
- Silent file operation failures (data loss possible)

## Green Lights
✅ **You're healthy**:
- All agents import successfully
- Telemetry flowing for all events
- File operations atomic and clean
- Zero unexplained failures
## Scheduled Autonomy With Guardrails

Heartbeat allows Mission Control to run scheduled turns without inbound prompts.

These runs must be **predictable, low-cost, and safety-bounded**.

Mission Control is the ONLY agent permitted to run on heartbeat.

Workers run on demand only.

---

# 1. Purpose

Heartbeat exists to:

• maintain system health  
• generate periodic digests  
• detect stalled workflows  
• surface risks early  
• prevent task drift  

Heartbeat is not a replacement for human oversight.

---

# 2. Cost & Frequency Rules

Heartbeats execute full agent turns.

Short intervals increase token consumption.

## Recommended Schedule

### Daily
✔ digest generation  
✔ health summary  
✔ stalled task detection  

### Weekly
✔ skill audit queue review  
✔ permission drift review  
✔ unused artifact cleanup summary  

### Monthly
✔ policy drift scan  
✔ skills inventory review  

## Avoid

✖ minute-level intervals  
✖ high-frequency polling  
✖ redundant full scans  

---

# 3. Heartbeat Execution Flow

When heartbeat triggers:

## Step 1 — Health Check
- verify gateway running
- verify workspaces accessible
- detect recent failures
- detect loop patterns

## Step 2 — Task Integrity Check
- detect tasks stuck in RUNNING/BLOCKED
- identify retry loops
- produce escalation list if needed

## Step 3 — Artifact Review
- ensure required digests exist
- check for failed validation artifacts
- verify artifact directory integrity

## Step 4 — Security & Risk Scan
- detect public binding risks
- detect policy drift indicators
- check pending skill audit approvals

## Step 5 — Digest Generation
Create:
`/artifacts/digests/YYYY-MM-DD_system_digest.md`

Include:
- system health
- alerts & risks
- blocked tasks
- approval queue
- recommended actions

---

# 4. Heartbeat Output Artifacts

### System Digest
Daily health and status.

### Escalation Report (if needed)
Generated when:
- tasks stuck
- policy violations
- security risk indicators
- skill approvals pending

Path:
`/artifacts/system/health/YYYY-MM-DD_escalations.md`

---

# 5. Safety Guardrails

Heartbeat MUST NOT:

✖ install skills  
✖ expand tool permissions  
✖ execute destructive actions  
✖ run shell commands outside allowlist  
✖ bypass approval gates  

If risk is detected → escalate, do not act.

---

# 6. Loop & Failure Detection

Heartbeat should flag:

• repeated task retries  
• recurring failures  
• validation rejections  
• agent non-responsiveness  

If detected:
- stop automatic retries
- escalate to operator

---

# 7. Token Efficiency Rules

Heartbeat should:

✔ reuse cached results where possible  
✔ summarize instead of reprocessing  
✔ avoid re-validating unchanged artifacts  
✔ avoid re-running completed workflows  

Do NOT re-run tasks unless state changed.

---

# 8. When to Escalate to Operator

Escalate if:

- security risk indicators present  
- skill approval pending > 48h  
- repeated task failure  
- policy violation detected  
- workspace integrity issue  

---

# 9. When Heartbeat Should Skip Work

Skip digest if:

- no changes since last run  
- no new tasks or alerts  
- no health changes detected  

Write a minimal “no change” note instead.

---

# 10. Observability

Log heartbeat run:

`/logs/orchestrator/heartbeat.log`

Include:
- run timestamp
- tasks reviewed
- issues detected
- actions taken
- token usage estimate

---

# 11. Operational Philosophy

Heartbeat exists to maintain clarity, not to increase automation.

It surfaces issues early, prevents drift, and protects system integrity.

Mission Control escalates.  
Humans decide.  
Workers execute.

---