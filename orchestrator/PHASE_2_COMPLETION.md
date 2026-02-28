# Phase 2: Grafana Dashboards Implementation - COMPLETED

**Date Completed:** February 22, 2026  
**Effort:** 8 hours  
**Status:** ✅ COMPLETE

---

## What Was Delivered

### 1. Prometheus Configuration
- **File:** `/orchestrator/monitoring/prometheus.yml`
- **Purpose:** Scrape orchestrator metrics every 15 seconds
- **Jobs configured:**
  - `orchestrator` job → targets `orchestrator:9100/metrics`
  - `prometheus` self-monitoring
  - `alertmanager` self-monitoring
- **Status:** Ready to use with existing docker-compose

### 2. Grafana Datasource & Alerts
- **File:** `/orchestrator/monitoring/datasources.yml`
  - Configures Grafana to connect to Prometheus automatically
  - Uses internal Docker network (`prometheus:9090`)

- **File:** `/orchestrator/monitoring/alert-rules.yml`
  - 7 pre-defined alert rules:
    - High error rate (>5%)
    - High daily cost (>$25)
    - Approval backlog (>5 pending)
    - Approval SLA breach (p95 >60s)
    - High violation rate (>1/sec)
    - Agent overloaded (>20 active tasks)
    - Prometheus scrape failures

- **File:** `/orchestrator/monitoring/alertmanager.yml`
  - Stub configuration (ready for Phase 3 webhook routing)

### 3. Three Production Dashboards

#### Dashboard A: Agent Performance (`agent-performance.json`)
**Panels:**
1. Task Completion Rate (line chart) — tasks/min per agent
2. Error Rate % (gauge) — thresholds: green <5%, yellow 5-10%, red >10%
3. Active Tasks per Agent (stacked bar) — real-time workload
4. Top 5 Agents (table) — by completion rate

**Refresh Rate:** 30 seconds  
**Time Range:** Last 1 hour (user-adjustable)  
**Variables:** `$agent`, `$timerange`  
**Use Case:** Operational troubleshooting, spotting bottlenecks

#### Dashboard B: Cost Tracking (`cost-tracking.json`)
**Panels:**
1. Total Daily Cost (big number) — USD, with sparkline
2. Cost per Agent & Model (stacked bar) — breakdown
3. Cost Distribution by Model (donut) — gpt-4o-mini vs Claude
4. Top 10 Agents by Cost (table) — financial analytics

**Refresh Rate:** 60 seconds (cost updates less frequently)  
**Time Range:** Last 30 days  
**Variables:** `$agent`, `$model`  
**Use Case:** Budget tracking, cost optimization, forecasting

#### Dashboard C: Security & Approvals (`security-approvals.json`)
**Panels:**
1. Approval SLA Compliance % (gauge) — thresholds: red <50%, yellow <75%, green ≥90%
2. Pending Approvals Queue (big number) — current backlog
3. Security Violations Rate (gauge) — violations/sec
4. Skill Access: Allowed vs Denied (stacked area) — security decisions
5. Violation Types (pie chart) — breakdown of violation types

**Refresh Rate:** 30 seconds  
**Time Range:** Last 24 hours  
**Variables:** `$skill`, `$violation_type`  
**Use Case:** Compliance monitoring, SLA tracking, security audit

### 4. Dashboard Provisioning
- **File:** `/orchestrator/monitoring/providers.yml`
- **Purpose:** Auto-load dashboard JSON files into Grafana on container startup
- **Behavior:** Dashboards appear in "Orchestrator" folder automatically

### 5. Documentation
- **File:** `/orchestrator/monitoring/dashboards/README.md`
- **Content:**
  - Dashboard overview and access instructions
  - How to edit dashboards (UI vs JSON)
  - Variable/templating reference
  - 30+ Prometheus queries documented
  - Troubleshooting guide
  - Performance tips

---

## How to Use (Verification Steps)

### Step 1: Start the Docker Environment
```bash
cd orchestrator
docker-compose up -d
```

**Expected output:**
- `wagging-prometheus` running on port 9090
- `wagging-grafana` running on port 3001
- `wagging-alertmanager` running on port 9093
- `wagging-orchestrator` running on port 3000 (with metrics on 9100)

### Step 2: Verify Prometheus is Scraping
```bash
curl http://localhost:9090/targets
```

**Expected:** "orchestrator" job shows **UP** (green)

Alternative:
```bash
curl http://localhost:9100/metrics | head
```

**Expected:** Prometheus text format metrics (e.g., `# HELP agent_tasks_started_total`)

### Step 3: Access Grafana
Navigate to: **http://localhost:3001**

**Login:** 
- Username: `admin`
- Password: `admin` (or from docker-compose.yml `GRAFANA_PASSWORD`)

### Step 4: Verify Dashboards Loaded
- Click **Home** → **Dashboards**
- Look for **"Orchestrator"** folder
- Should see 3 dashboards:
  - ✅ Agent Performance Dashboard
  - ✅ Cost Tracking Dashboard
  - ✅ Security & Approvals Dashboard

### Step 5: Generate Sample Data (Optional)
Since this is a new deployment, dashboards will be empty until tasks run.

To trigger some metrics:
```bash
# Enqueue a sample task
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"type":"test-task", "payload":{}}'
```

Or run orchestrator normally and let tasks accumulate metrics.

### Step 6: View Dashboard Data
Click on any dashboard → Panels will show:
- **Agent Performance:** Task rates, errors (if tasks ran)
- **Cost Tracking:** Daily cost, model distribution
- **Security & Approvals:** Permission events, violations (if any)

---

## Integration with Phase 1

Phase 1 (Prometheus metrics) + Phase 2 (Grafana dashboards) are now connected:

```
┌─ Orchestrator ───────────────────────────┐
│ - onAgentTaskStart()                      │
│ - onAgentTaskComplete()                   │
│ - logViolation()                          │
│ - onApprovalRequested()                   │
│ → Emits metrics to port 9100 (/metrics)  │
└──────────────────────────────────────────┘
              ↓ (every 15s scrape)
┌─ Prometheus ──────────────────────────────┐
│ Stores time-series data                   │
│ Evaluates alert rules                     │
│ Exposes query API on port 9090            │
└──────────────────────────────────────────┘
              ↓ (queries metrics)
┌─ Grafana ─────────────────────────────────┐
│ 3 Dashboards visualize data               │
│ Accessible at http://localhost:3001       │
│ Auto-refreshes every 30-60s                │
└──────────────────────────────────────────┘
```

---

## Configuration Files Breakdown

### prometheus.yml
```yaml
scrape_configs:
  - job_name: 'orchestrator'
    static_configs:
      - targets: ['orchestrator:9100']
    scrape_interval: 15s
```
- **What it does:** Tells Prometheus to scrape our `/metrics` endpoint every 15 seconds
- **Where it lives:** Mounted in docker-compose as volume
- **Edit it:** `docker-compose restart prometheus` after changes

### datasources.yml
```yaml
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
```
- **What it does:** Tells Grafana where Prometheus is
- **Auto-loads:** On Grafana startup
- **Result:** Grafana dashboards can query Prometheus

### alert-rules.yml
7 alert rules that fire when thresholds are exceeded:
- Example: `expr: (sum(rate(agent_tasks_failed_total[5m])) / sum(rate(agent_tasks_started_total[5m]))) > 0.05`
- When true: Alert triggers, sends to AlertManager
- Phase 3: AlertManager routes to Slack/email

### Dashboard JSONs
3 pre-built dashboards with:
- 12 total panels across 3 dashboards
- 30+ Prometheus queries
- Auto-provisioning setup
- Variable templates (`$agent`, `$model`, etc.)

---

## Metrics Available in Dashboards

All Phase 1 metrics are now queryable in Grafana:

### Agent Metrics
- `agent_tasks_started_total` — total tasks started
- `agent_tasks_completed_total` — total tasks completed
- `agent_tasks_failed_total` — total tasks failed
- `agent_active_tasks` — currently active tasks (gauge)
- `agent_task_duration_seconds` — task execution duration (histogram)
- `agent_cost_per_day_usd` — daily cost per agent
- `agent_total_cost_per_day_usd` — total daily cost

### Security Metrics
- `skill_access_allowed_total` — allowed access attempts
- `skill_access_denied_total` — denied access attempts
- `permission_escalation_requests_total` — escalation requests
- `active_permissions_granted` — current permissions (gauge)
- `audit_violations_logged_total` — security violations

### Approval Metrics
- `task_approval_requests_total` — total approval requests
- `approval_response_time_seconds` — approval turnaround (histogram)
- `pending_approvals_count` — pending backlog (gauge)
- `approval_auto_escalated_total` — SLA breaches

---

## What's Next (Phase 3)

**Phase 3: Alert Rules & Webhook Routing (2 hours)**

Will add:
- Slack webhook integration (alert notifications)
- Email routing for critical alerts
- Custom alert severities
- Alert grouping & deduplication

---

## Troubleshooting Checklist

| Issue | Solution |
|-------|----------|
| "No prometheus datasource" in Grafana | Restart Grafana: `docker-compose restart grafana` |
| Dashboards show "No Data" | Check Prometheus targets: http://localhost:9090/targets (should show UP) |
| Metrics endpoint not responding | Check orchestrator logs: `docker logs wagging-orchestrator` |
| Grafana won't connect to Prometheus | Verify network: `docker network ls` should show `orchestrator-net` |
| JSON validation error | Validate JSON syntax of dashboard files before importing |
| Variables not filtering | Ensure metric has the label (e.g., agent_tasks_completed_total has `agent` label) |

---

## Files Created/Modified

**New Files:**
```
orchestrator/monitoring/
├── prometheus.yml
├── datasources.yml
├── alert-rules.yml
├── alertmanager.yml
├── providers.yml
└── dashboards/
    ├── agent-performance.json (~800 LOC)
    ├── cost-tracking.json (~750 LOC)
    ├── security-approvals.json (~600 LOC)
    └── README.md (documentation)
```

**Modified Files:**
```
orchestrator/src/index.ts
  - Added import: startMetricsServer
  - Added bootstrap call: await startMetricsServer()
```

**Existing Files Used (No Changes):**
- `docker-compose.yml` — already had prometheus, grafana, alertmanager services
- Phase 1 metrics code (prometheus.ts, agent-metrics.ts, etc.)

---

## Summary

✅ **Phase 2 Complete**

You now have:
- **Prometheus** collecting 16 metrics from orchestrator every 15s
- **Grafana** with 3 production dashboards (agent, cost, security)
- **AlertManager** configured and ready for Phase 3 routing
- **Dashboard provisioning** auto-loads JSON files
- **30+ Prometheus queries** documented and ready to use
- **Full integration** between metrics (Phase 1) and visualization (Phase 2)

**Next:** Phase 3 will add alert routing (Slack/email) to notify on events.

Ready to proceed?
