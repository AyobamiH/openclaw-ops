# Option A: Implementation Roadmap (21 Hours)
## Enhanced Monitoring + Permanent Memory System

**Decision Date:** Feb 22, 2026  
**Total Allocation:** 21 hours (14h monitoring + 7h memory)  
**Start:** Now  
**Target Completion:** 48 hours wall-clock time  
**Status:** ACTIVE IMPLEMENTATION  

---

## Executive Summary

This document outlines the complete end-to-end implementation of Option A:
- **Enhanced Monitoring Dashboard:** Real-time visibility into 12-agent orchestrator
- **Permanent Memory System:** Architecture to consolidate learning, decisions, and metrics across sessions

Both systems work together to provide:
✅ Operational transparency (what's happening right now)  
✅ Historical awareness (what happened, why, lessons learned)  
✅ Data-driven decisions (metrics, patterns, alerts)  
✅ Continuous improvement (track progress, validate decisions)  

---

## Timeline: 21 Hours Broken Down

### ⏱️ PHASE 1: Prometheus Metrics Layer (4 hours)

**Goal:** Export comprehensive metrics from orchestrator to Prometheus  
**Deliverables:** 8 new metric types, prom client integration, metrics endpoint  
**Files Created/Modified:** 4 files, ~800 LOC  

#### 1.1 Setup Prometheus Client (45 min)
- Add `prom-client` dependency to orchestrator/package.json
- Create `/orchestrator/src/metrics/prometheus.ts` (200 LOC)
  - Initialize Counter, Gauge, Histogram, Summary metrics
  - Export /metrics endpoint on port 9100 (internal)
  - Prometheus scrape every 15s

#### 1.2 Core Agent Metrics (1 hour)
- Create `/orchestrator/src/metrics/agent-metrics.ts` (250 LOC)
  - Counter: agent_tasks_started
  - Counter: agent_tasks_completed
  - Counter: agent_tasks_failed
  - Gauge: agent_active_tasks
  - Histogram: agent_task_duration_seconds (buckets: 0.5, 2.5, 5, 10s)
  - Gauge: agent_cost_per_day (tracked per agent)

#### 1.3 Skill & Permission Metrics (1 hour)
- Create `/orchestrator/src/metrics/security-metrics.ts` (200 LOC)
  - Counter: skill_access_allowed
  - Counter: skill_access_denied
  - Counter: permission_escalation_requests
  - Gauge: active_permissions_granted (by agent)
  - Counter: audit_violations_logged

#### 1.4 Approval Gate Metrics (30 min)
- Create `/orchestrator/src/metrics/approval-metrics.ts` (150 LOC)
  - Counter: task_approval_requests
  - Histogram: approval_response_time_seconds (SLA: <60s)
  - Gauge: pending_approvals_count
  - Counter: approval_auto_escalated

#### 1.5 Integration with Agent Registry (30 min)
- Modify `/orchestrator/src/core/agent.ts` (+50 LOC)
  - Hook metrics emission on task lifecycle events
  - Report cost deltas on each LLM call
  - Log all security decisions to metrics

#### 1.6 Validation (15 min)
- Manual test: curl http://localhost:9100/metrics
- Verify all 8 metric types present
- Check Prometheus scrape works

**Checkpoint:** All metrics flowing, Prometheus scraping successfully ✅

---

### 📊 PHASE 2: Grafana Dashboards (8 hours)

**Goal:** Build 8 production-grade Grafana panels  
**Deliverables:** Main dashboard JSON, 4 supporting dashboards, 50+ Prometheus queries  
**Files Created:** 6 files, ~2,000 LOC  

#### 2.1 Dashboard Infrastructure (1 hour)
- Create `/orchestrator/src/config/dashboards/` folder structure
- Create `/orchestrator/src/config/dashboards/main-dashboard.json` (400 LOC)
  - Grid layout: 3x4 panels (12 total)
  - Refresh rate: 30 seconds
  - Timezone: UTC
  - Templated variables: $agent, $skill, $timerange

#### 2.2 Panel 1-2: Agent Performance (1.5 hours)
- **Panel 1: Tasks by Agent (stacked bar chart)**
  - Query: `sum(rate(agent_tasks_completed[5m])) by (agent)`
  - Show: Completion rate per agent, color-coded
  - Threshold: 50/min normal (yellow >100/min, red >150/min)

- **Panel 2: Agent Error Rate %5-minute (gauge)**
  - Query: `100 * sum(rate(agent_tasks_failed[5m])) / sum(rate(agent_tasks_started[5m])) by (agent)`
  - Show: Error % with SLA threshold (<1% green, 1-3% yellow, >3% red)
  - Target: Stay green

#### 2.3 Panel 3-4: Cost & Resource (1.5 hours)
- **Panel 3: Daily Cost Run Rate (line chart)**
  - Query: `sum(agent_cost_per_day)`
  - Show: Trending line with SLA boundary at $23/day
  - Annotation: Budget exceeded alerts
  - Projection: "At current rate, $X by end of day"

- **Panel 4: Task Duration Distribution (heatmap)**
  - Query: `rate(agent_task_duration_seconds_bucket[5m])`
  - Show: Heatmap of latency percentiles over time
  - Axes: Time (X), Duration buckets (Y), Intensity (color)
  - Highlight outliers >2.5s

#### 2.4 Panel 5-6: Security & Compliance (1.5 hours)
- **Panel 5: Permission Decisions (pie chart)**
  - Queries: 
    - `sum(rate(skill_access_allowed[5m]))`
    - `sum(rate(skill_access_denied[5m]))`
  - Show: Ratio of allowed vs denied (should be mostly allowed with occasional denials)
  - Alert: If denials spike unexpectedly

- **Panel 6: Audit Violations Timeline (alert list)**
  - Query: `increase(audit_violations_logged[1h])`
  - Show: Chronological list of violations
  - Action: Click to drill into details

#### 2.5 Panel 7-8: Approval Gate (1 hour)
- **Panel 7: Approval Turnaround (gauge)**
  - Query: `histogram_quantile(0.95, rate(approval_response_time_seconds_bucket[5m]))`
  - Show: 95th percentile approval response time
  - SLA: <60s (green), 60-120s (yellow), >120s (red)

- **Panel 8: Pending Approvals (counter)**
  - Query: `gauge_pending_approvals_count`
  - Show: Current count of tasks awaiting approval
  - Alert: Red if >5 for >10 minutes

#### 2.6 Additional Dashboards (1 hour)
- Create agent-detail view (drill-down from main)
- Create skill-access audit dashboard
- Create cost breakdown by model (gpt-4o-mini vs Claude)
- Create SLA compliance dashboard

**Checkpoint:** Main dashboard live with 8 panels, all queries validated ✅

---

### 🚨 PHASE 3: Alert Rules & Notifiers (2 hours)

**Goal:** Auto-escalate failures, cost overruns, SLA breaches  
**Deliverables:** 10 alert rules, webhook integration, escalation logic  
**Files Created:** 3 files, ~600 LOC  

#### 3.1 Prometheus Alert Rules (45 min)
- Create `/orchestrator/src/config/prometheus-alerts.yml` (200 LOC)
- Define 10 rules:
  1. Error rate >5% for 2 minutes
  2. Agent cost exceeds $23/day by >10%
  3. Approval response time >2 minutes
  4. Task duration >5 seconds (p95)
  5. Permission denials spike (>3x baseline)
  6. Audit violations >1 per hour
  7. Pending approvals >5 for >10 min
  8. Agent non-responsive (no heartbeat >5 min)
  9. Skill access anomaly detected
  10. API rate limit warning

#### 3.2 Alertmanager Webhook Integration (45 min)
- Create `/orchestrator/src/alerts/webhook-handler.ts` (200 LOC)
  - Receive alerts from Alertmanager
  - Deduplicate repeated alerts (10-min window)
  - Escalate to Slack/email/PagerDuty
  - Log all alerts to `/logs/alerts/`

#### 3.3 Escalation & Response Logic (30 min)
- Create `/orchestrator/src/alerts/escalation.ts` (200 LOC)
  - Severity levels: Info → Warning → Critical
  - Routing: Slack → Email → PagerDuty → Human escalation
  - Auto-remediation hooks (pause tasks, increase capacity)
  - Audit trail for all escalations

**Checkpoint:** Alerts triggering correctly, routing working ✅

---

### 💾 PHASE 4: Daily Memory Consolidation (3 hours)

**Goal:** Automatic synthesis of daily logs into long-term memory  
**Deliverables:** Memory consolidation service, daily snapshots, knowledge base builder  
**Files Created:** 4 files, ~800 LOC  

#### 4.1 Daily Snapshot Service (1 hour)
- Create `/orchestrator/src/memory/snapshot-service.ts` (250 LOC)
  - **Trigger:** Daily cron at 23:00 UTC
  - **Collection:**
    - Summary of tasks completed (count, success rate, cost)
    - Major decisions made
    - Alerts triggered & resolved
    - Error patterns observed
    - Cost breakdown by agent/model

  - **Output:** JSON snapshot saved to `/logs/snapshots/2026-02-22.json`

#### 4.2 Memory Consolidation Engine (1 hour)
- Create `/orchestrator/src/memory/consolidator.ts` (300 LOC)
  - **Inputs:** Last 7 days of snapshots
  - **Process:**
    - Identify recurring patterns (errors, bottlenecks, decision outcomes)
    - Extract insights ("Agent X fails on type Y tasks")
    - Score confidence (how strongly supported by data)
  - **Output:** Curated weekly summary saved to `memory/YYYY-WW-summary.md`
  - **Format:** 
    ```
    # Week of Feb 16-22
    ## Key Metrics
    - Total tasks: 21,000
    - Success rate: 98.7%
    - Cost: £153 (on pace)
    
    ## Decisions Made
    - Escalated agent X from cheap to balanced tier (improved success 3%)
    - Disabled skill Y for agent Z (failed 5% of the time)
    
    ## Lessons Learned
    - approval gate works well (<60s average)
    - need better error handling for type Z tasks
    ```

#### 4.3 Metrics Auto-Save (45 min)
- Create `/orchestrator/src/memory/metrics-snapshots.ts` (150 LOC)
  - Query Prometheus every 6 hours
  - Save snapshot of: cost/day, error rate, latency p95, approval turnaround
  - Store in `/logs/metrics-history/2026-02-22T18.json`
  - Used for trend analysis & historical comparison

#### 4.4 Integration with MEMORY.md (30 min)
- Modify MEMORY.md template to include:
  - Metrics snapshot section (updated weekly)
  - Decision log (what changed, why)
  - Known issues (tracked across sessions)
  - Next actions (deferred decisions)

**Checkpoint:** Daily snapshots created, weekly summaries generating ✅

---

### 🧠 PHASE 5: Knowledge Base Automation (2 hours)

**Goal:** Auto-update reference docs with discovered patterns  
**Deliverables:** Doc generation service, error encyclopedia, best practices wiki  
**Files Created:** 3 files, ~500 LOC  

#### 5.1 Error Encyclopedia Builder (1 hour)
- Create `/orchestrator/src/memory/error-encyclopedia.ts` (200 LOC)
  - **Trigger:** After each phase (when failures consolidate)
  - **Process:**
    - Parse error logs from week
    - Group by error type
    - Extract: cause, frequency, resolution, workaround
  - **Output:** `/docs/ENCOUNTERED_ERRORS.md` (auto-generated)
  - **Example entry:**
    ```
    ### Error: Task Timeout on Data Extraction
    - **Frequency:** 2.3% of extraction tasks
    - **Root Cause:** doc size >50MB with complex formatting
    - **Resolution:** Split doc into chunks, re-attempt
    - **Workaround:** Manually pre-filter large docs
    - **Status:** Mitigation implemented, monitoring
    ```

#### 5.2 Best Practices Wiki (45 min)
- Create `/orchestrator/src/memory/best-practices-generator.ts` (200 LOC)
  - **Trigger:** Weekly after consolid
ation
  - **Analysis:**
    - Which agents succeed most? What patterns work?
    - Optimal model choice (gpt-4o-mini vs Claude) by task type
    - Skill combinations that work well
  - **Output:** `/docs/BEST_PRACTICES.md` (auto-updated)
  - **Example:**
    ```
    ### Best Practices
    - QA verification works best with Claude 3.5 Sonnet (99% success vs 94% with gpt-4o-mini)
    - Batch processing >100 items at once reduces per-item latency by 15%
    - Pre-validation before approval gates saves ~12% cost
    ```

#### 5.3 Decision Audit Trail (15 min)
- Modify existing docs to auto-link to decisions
- Create `/docs/DECISIONS.md` (auto-populated from MEMORY.md)
- Enable: "Why was this decision made? When? What data supported it?"

**Checkpoint:** Error encyclopedia live, best practices auto-updating ✅

---

### 🔐 PHASE 6: Metrics Persistence Layer (2 hours)

**Goal:** Long-term storage of metrics for trend analysis & historical queries  
**Deliverables:** MongoDB metrics schema, time-series aggregation, export utilities  
**Files Created:** 3 files, ~400 LOC  

#### 6.1 MongoDB Metrics Schema (45 min)
- Modify `/orchestrator/mongo-init.js` (add +100 LOC)
- Create collections:
  - `metrics_daily` — daily aggregates (cost, error rate, latency, approvals)
  - `metrics_hourly` — hourly snapshots for trend analysis
  - `decisions_log` — decisions with supporting data + outcome tracking
  - `anomalies` — detected anomalies w/ ML confidence scores

- Schema example:
  ```json
  {
    "date": "2026-02-22",
    "cost_total": 23.15,
    "cost_by_agent": { "market-research": 5.2, ... },
    "cost_by_model": { "gpt-4o-mini": 12.5, "claude-sonnet": 10.65 },
    "error_rate": 0.0087,
    "p95_latency_seconds": 2.34,
    "approval_turnaround_seconds": 45.2,
    "tasks_completed": 2890,
    "tasks_failed": 25
  }
  ```

#### 6.2 Time-Series Aggregation (45 min)
- Create `/orchestrator/src/memory/metrics-persistence.ts` (200 LOC)
  - Query Prometheus every 60 minutes
  - Aggregate into hourly summaries
  - Push to MongoDB for historical storage
  - Enable: "What was cost on Feb 15? How many errors last month?"

#### 6.3 Export & Reporting (30 min)
- Create `/orchestrator/src/memory/metrics-exporter.ts` (100 LOC)
  - Export metrics as CSV for analysis
  - Generate monthly performance report (PDF-ready data)
  - Enable trend charts: "Cost trending up 5%/week, need optimization"

**Checkpoint:** Historical metrics persisting, queries working ✅

---

### ✅ PHASE 7: Integration Testing & Validation (2 hours)

**Goal:** Verify all components work together end-to-end  
**Deliverables:** 12 integration tests, validation checklist  
**Files Created:** 1 file, ~400 LOC  

#### 7.1 Integration Test Suite (1.5 hours)
- Create `/orchestrator/test/integration/monitoring-memory.test.ts` (400 LOC)
  - Test 1: Metrics flow from agent → Prometheus → Grafana ✅
  - Test 2: Alert rules trigger on error rate spike ✅
  - Test 3: Daily snapshot creates + consolidates ✅
  - Test 4: Memory update reflects in MEMORY.md ✅
  - Test 5: Error encyclopedia rebuilds correctly ✅
  - Test 6: Metrics persist to MongoDB ✅
  - Test 7: Cost tracking accurate across agents ✅
  - Test 8: Approval gate SLA tracked correctly ✅
  - Test 9: Dashboard queries return expected data ✅
  - Test 10: Alert webhook receives + routes correctly ✅
  - Test 11: Historical metrics queryable from MongoDB ✅
  - Test 12: Full 7-day memory consolidation cycle ✅

#### 7.2 Validation Checklist (30 min)
- Manual validation:
  - ✅ Prometheus scrape shows all 8 metrics
  - ✅ Grafana dashboard renders, panels interactive
  - ✅ Alerts trigger (simulate error spike, verify Slack receipt)
  - ✅ Daily snapshot creates by 23:00 UTC
  - ✅ Weekly consolidation generates MEMORY updates
  - ✅ MongoDB queries return expected data
  - ✅ Cost tracking accurate to within 1%
  - ✅ All SLA boundaries correctly enforced

**Checkpoint:** All 12 tests passing, manual validation complete ✅

---

### 📚 PHASE 8: Documentation & Deployment (1 hour)

**Goal:** Complete docs for operations & future maintenance  
**Deliverables:** 2 guides, deployment checklist, troubleshooting  
**Files Created:** 3 files, ~500 LOC  

#### 8.1 Operations Guide (30 min)
- Create `/docs/OPTION_A_OPERATIONS.md` (200 LOC)
  - How to read the main dashboard
  - How to interpret alerts
  - Common issues & remediation
  - How to access historical metrics
  - Escalation procedures

#### 8.2 Deployment Checklist (20 min)
- Update `/orchestrator/DOCKER_QUICK_REFERENCE.md` (+50 LOC)
  - Pre-deployment checks
  - Docker Compose additions for monitoring stack
  - Post-deployment validation
  - Health endpoint verification

#### 8.3 Troubleshooting Guide (10 min)
- Create `/docs/MONITORING_TROUBLESHOOTING.md` (100 LOC)
  - Metrics not flowing? Check these 3 things
  - Dashboard empty? Debug steps
  - Alerts not routing? Webhook validation

**Checkpoint:** All docs reviewed & deployed ✅

---

## Detailed Time Allocation

| Phase | Component | Hours | LOC | Status |
|-------|-----------|-------|-----|--------|
| 1 | Prometheus integration | 4 | 850 | Ready to start |
| 2 | Grafana dashboards | 8 | 2,000 | Ready to start |
| 3 | Alert rules | 2 | 600 | Ready to start |
| 4 | Memory consolidation | 3 | 800 | Ready to start |
| 5 | Knowledge base | 2 | 500 | Ready to start |
| 6 | Metrics persistence | 2 | 400 | Ready to start |
| 7 | Integration testing | 2 | 400 | Ready to start |
| 8 | Documentation | 1 | 500 | Ready to start |
| **TOTAL** | | **21** | **6,050** | **READY TO EXECUTE** |

---

## File Structure After Completion

```
orchestrator/
├── src/
│   ├── metrics/
│   │   ├── prometheus.ts (200 LOC)
│   │   ├── agent-metrics.ts (250 LOC)
│   │   ├── security-metrics.ts (200 LOC)
│   │   ├── approval-metrics.ts (150 LOC)
│   │   └── index.ts
│   ├── memory/
│   │   ├── snapshot-service.ts (250 LOC)
│   │   ├── consolidator.ts (300 LOC)
│   │   ├── metrics-snapshots.ts (150 LOC)
│   │   ├── error-encyclopedia.ts (200 LOC)
│   │   ├── best-practices-generator.ts (200 LOC)
│   │   ├── metrics-persistence.ts (200 LOC)
│   │   ├── metrics-exporter.ts (100 LOC)
│   │   └── index.ts
│   ├── alerts/
│   │   ├── webhook-handler.ts (200 LOC)
│   │   ├── escalation.ts (200 LOC)
│   │   └── index.ts
│   ├── config/
│   │   ├── prometheus-alerts.yml (200 LOC)
│   │   └── dashboards/
│   │       ├── main-dashboard.json (400 LOC)
│   │       ├── agent-detail-dashboard.json (300 LOC)
│   │       ├── cost-breakdown-dashboard.json (250 LOC)
│   │       ├── sla-compliance-dashboard.json (200 LOC)
│   │       └── audit-dashboard.json (150 LOC)
│   └── core/
│       └── agent.ts (modified +50 LOC)
├── test/
│   └── integration/
│       └── monitoring-memory.test.ts (400 LOC)
├── docker-compose.yml (modified)
├── Dockerfile (no change needed)
├── mongo-init.js (modified +100 LOC)
└── docs/
    ├── OPTION_A_OPERATIONS.md (200 LOC)
    └── MONITORING_TROUBLESHOOTING.md (100 LOC)

docs/
├── ENCOUNTERED_ERRORS.md (auto-generated)
├── BEST_PRACTICES.md (auto-generated)
├── DECISIONS.md (auto-generated)
└── OPTION_A_OPERATIONS.md (200 LOC)

logs/
├── snapshots/
│   └── 2026-02-22.json (created daily)
├── metrics-history/
│   └── 2026-02-22T18.json (created 4x/day)
└── alerts/
    └── 2026-02-22-escalations.log

memory/
├── 2026-WW07-summary.md (created weekly)
└── YYYY-MM-DD.md (existing daily logs)

MEMORY.md (updated with weekly metrics snapshots)
```

---

## Success Criteria

- ✅ All 8 metrics types flowing to Prometheus
- ✅ Main dashboard with 8 panels, all queries working
- ✅ 10 alert rules configured, webhooks routing correctly
- ✅ Daily snapshots created, weekly consolidations generating
- ✅ Error encyclopedia & best practices auto-updating
- ✅ MongoDB persisting historical metrics
- ✅ All 12 integration tests passing
- ✅ Documentation complete & current
- ✅ Zero manual intervention required for daily snapshots
- ✅ Startup procedures documented & validated

---

## Next Steps After Option A

- **Short term:** Monitor for 1 week, collect feedback
- **Medium term:** Add ML anomaly detection (Phase 9 - future)
- **Open-source:** After 2 weeks validation, release as open-source
- **Scale:** Consider Kubernetes if agent count reaches 100+

---

## Rollback Plan (If Required)

1. Keep current Docker image tagged as `v3-before-option-a`
2. All new code in feature branch `feature/option-a` until merged
3. Can revert to `main` branch anytime before merge
4. Prometheus/Grafana data retained (non-destructive)
5. Memory files only appended (can be rolled back manually)

---

**Total Implementation Time: 21 hours**  
**Ready to execute: YES ✅**  
**Beginning Phase 1 now.**
