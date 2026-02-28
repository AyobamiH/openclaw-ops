# Grafana Dashboards

## Overview

Three dashboards are auto-provisioned on container startup:

1. **Agent Performance Dashboard** — Operational metrics for troubleshooting
   - Task completion rates by agent
   - Error rate %
   - Active tasks per agent
   - Top performing agents

2. **Cost Tracking Dashboard** — Financial metrics and budget tracking
   - Total daily cost (USD)
   - Cost breakdown by agent and model
   - Cost distribution (pie chart)
   - Top agents by daily cost
   - Monthly forecasting

3. **Security & Approvals Dashboard** — Compliance and SLA tracking
   - Approval SLA compliance %
   - Pending approvals queue
   - Security violations rate
   - Skill access allowed vs denied
   - Violation types breakdown

---

## Access Dashboards

- **Grafana UI:** http://localhost:3001
- **Login:** admin / (password from docker-compose.yml)
- **Navigate:** Home → Dashboards → Orchestrator folder

---

## How to Edit/Add Dashboards

### Option A: Edit via Grafana UI (Recommended for quick changes)

1. Open Grafana: http://localhost:3001
2. Navigate to desired dashboard
3. Click "Edit" button
4. Make changes to panels, queries, etc.
5. Click "Save" button
6. When prompted, choose "Save as new dashboard" or "Update existing"
7. **To persist to git:**
   - Dashboard → Menu (⋮) → Export
   - Save JSON to `/orchestrator/monitoring/dashboards/dashboard-name.json`
   - Commit to git

### Option B: Edit JSON directly (Version control preferred)

1. Edit dashboard JSON file in `/orchestrator/monitoring/dashboards/`
   - `agent-performance.json`
   - `cost-tracking.json`
   - `security-approvals.json`

2. Validate JSON syntax (use an online JSON validator or IDE)

3. Restart Grafana to reload dashboards:
   ```bash
   docker-compose restart grafana
   ```

4. Verify changes: Open Grafana and check dashboard updates

---

## Dashboard Variables (Templating)

All dashboards support filtering via dropdown variables:

### Agent Performance Dashboard
- `$agent` — Filter by specific agent (e.g., "market-research", "qa-verification")
- `$timerange` — Time range selector (1h, 6h, 24h)

### Cost Tracking Dashboard
- `$agent` — Filter by agent
- `$model` — Filter by model (e.g., "gpt-4o-mini", "claude-sonnet")

### Security & Approvals Dashboard
- `$skill` — Filter by skill (e.g., "file_read", "code_exec")
- `$violation_type` — Filter by violation type

To use variables in queries:
```promql
agent_tasks_completed_total{agent=~"$agent"}
```

---

## Prometheus Queries Reference

### Agent Performance Queries

| Panel | Query | Measures |
|-------|-------|----------|
| Task Completion Rate | `sum(rate(agent_tasks_completed_total[5m])) by (agent)` | Tasks completed per minute |
| Error Rate % | `(sum(rate(agent_tasks_failed_total[5m])) / sum(rate(agent_tasks_started_total[5m])) * 100)` | % of tasks failing |
| Active Tasks | `agent_active_tasks` | Current active task count per agent |
| Task Duration p95 | `histogram_quantile(0.95, agent_task_duration_seconds)` | 95th percentile latency |
| Tasks by Type | `sum(agent_tasks_completed_total) by (task_type)` | Distribution of task types |
| Top Agents | `topk(5, sum(rate(agent_tasks_completed_total[1h])) by (agent))` | By completion rate |

### Cost Tracking Queries

| Panel | Query | Measures |
|-------|-------|----------|
| Total Daily Cost | `agent_total_cost_per_day_usd` | Sum of all agents' daily cost |
| Cost per Agent | `agent_cost_per_day_usd` | Cost broken down by agent/model |
| Cost by Model | `sum(agent_cost_per_day_usd) by (model)` | Distribution by LLM model |
| Cost per Task | `agent_total_cost_per_day_usd / agent_tasks_completed_total` | Average cost per completed task |
| Cost Forecast | Use linear regression alert rules | Trend analysis |
| Top Agents | `topk(10, sum(agent_cost_per_day_usd) by (agent))` | By daily cost |

### Security & Approvals Queries

| Panel | Query | Measures |
|-------|-------|----------|
| SLA Compliance | `histogram_quantile(0.5, approval_response_time_seconds) / 60 * 100` | % of approvals <60s |
| Pending Queue | `pending_approvals_count` | Current approval backlog |
| Violation Rate | `sum(rate(audit_violations_logged_total[5m]))` | Violations per second |
| Skill Access | `skill_access_allowed_total`, `skill_access_denied_total` | Allowed vs denied attempts |
| Violations Breakdown | `sum(rate(audit_violations_logged_total[1h])) by (violation_type)` | Distribution by type |

---

## Adding New Dashboards

1. Create dashboard JSON in Grafana UI:
   - Dashboard → New → Add panels as needed
   - Configure queries against Prometheus
   - Set variables ($agent, etc.)
   - Set refresh rate and time range

2. Export to JSON:
   - Dashboard Menu (⋮) → Export
   - Copy JSON

3. Save to `/orchestrator/monitoring/dashboards/my-dashboard.json`

4. Add to `providers.yml` if needed (usually auto-detected)

5. Restart Grafana:
   ```bash
   docker-compose restart grafana
   ```

---

## Troubleshooting

### "No Data" on Dashboard Panels

1. Check Prometheus is running:
   ```bash
   docker logs wagging-prometheus
   ```

2. Check orchestrator metrics endpoint:
   ```bash
   curl http://localhost:9100/metrics | head -20
   ```

3. Check Prometheus scrape targets:
   - Open http://localhost:9090/targets
   - Verify "orchestrator" job shows "UP"

### Dashboard Not Loading

1. Check Grafana logs:
   ```bash
   docker logs wagging-grafana
   ```

2. Validate JSON syntax of dashboard file

3. Verify datasource is correctly named "Prometheus" in dashboard JSON

### Variables Not Working

1. Ensure label names match metric definitions:
   - Metric: `agent_tasks_completed_total{agent="X", model="Y"}`
   - Variable: `label_values(agent_tasks_completed_total, agent)`

2. Verify queries use variable syntax: `{agent=~"$agent"}`

---

## Performance Tips

- **Large time ranges (30d+):** May be slow. Use aggregation (`_bucket` metrics)
- **High-cardinality labels:** Avoid filtering on query results; push to Prometheus query
- **Panel refresh rate:** 30-60s is typical; avoid <10s (higher load)
- **Dashboard update frequency:** 60s default (set in providers.yml `updateIntervalSeconds`)

---

## Next Steps (Phase 3)

- Configure alert routing (Slack/email)
- Set up Alertmanager webhook handlers
- Define SLA escalation policies

See `/orchestrator/monitoring/alert-rules.yml` for currently defined alerts.
