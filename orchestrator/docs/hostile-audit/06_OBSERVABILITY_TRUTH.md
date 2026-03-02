# 06_OBSERVABILITY_TRUTH.md - Metrics, Dashboards, Alerts Validation

Historical snapshot note: This is a dated hostile-audit artifact, not current runtime authority. Some findings in this file may now be stale. Current truth lives in active runtime code, `OPENCLAW_CONTEXT_ANCHOR.md`, and the current KB truth docs under `docs/OPENCLAW_KB/**`.

---

## Metrics Verification

### Claim: "16 custom metrics tracked"

**Verification:** ✅ **CONFIRMED** with caveats

**Metrics Found:**

1. `orchestrator_tasks_total` (Counter) - Total tasks processed
2. `orchestrator_task_duration_seconds` (Histogram) - Task execution time
3. `orchestrator_task_errors_total` (Counter) - Failed tasks
4. `orchestrator_agents_active` (Gauge) - Count of active agents
5. `orchestrator_alerts_received_total` (Counter) - Alerts webhook hits
6. `orchestrator_alert_deduplication_ratio` (Gauge) - % of alerts deduped
7. `orchestrator_kb_entries_total` (Gauge) - KB entry count
8. `orchestrator_kb_query_latency_seconds` (Histogram) - Query time
9. `orchestrator_memory_snapshot_lag_seconds` (Gauge) - Snapshot age
10. `orchestrator_consolidation_size_bytes` (Histogram) - Consolidation payload size
11. `orchestrator_database_connections_active` (Gauge) - Active DB connections
12. `orchestrator_database_query_latency_seconds` (Histogram) - DB query time
13. `orchestrator_permissions_denied_total` (Counter) - Denied permission checks
14. `orchestrator_security_events_total` (Counter) - Auth failures, attacks detected
15. `orchestrator_approval_queue_length` (Gauge) - Pending approvals
16. `orchestrator_approval_duration_seconds` (Histogram) - Approval completion time

**Cardinality Issues:** 
- Labels on all histograms increase cardinality
- Example: `orchestrator_task_duration_seconds{task_type="..."}` creates one series per unique task
- If 100 task types exist, 100 series for one metric family
- High cardinality can cause Prometheus performance issues

**Gaps:**
- ❌ No disk usage metric (can't track DB growth)
- ❌ No API endpoint response time breakdown (only KB has metrics)
- ❌ No webhook signature verification attempts metric
- ❌ No rate limit exceeded events metric

---

## Dashboard Verification

### Claim: "3 dashboards fully provisioned"

**Status:** ✅ **CONFIRMED** - All 3 exist and render

**Dashboard 1: security-approvals.json**
- Panels: ~10 (Approval queue, denial rate, top denied skills)
- Data Source: Prometheus
- Queries: 10+ PromQL expressions
- Issues: ✅ Functional, but missing "failed approval" alerts

**Dashboard 2: agent-performance.json**
- Panels: ~12 (Task success rate, latency, errors by agent)
- Data Source: Prometheus
- Issues: ⚠️ Agent names hardcoded in queries (breaks if agent added)

**Dashboard 3: cost-tracking.json**
- Panels: ~8 (Cost per hour, cost per task, trends)
- Data Source: Prometheus
- Issues: 🚨 Cost metrics don't actually exist (hardcoded values in panel definitions)

### Dashboard Problems

**Finding: Cost Dashboard Uses Fake Data**

Evidence:
```json
// monitoring/dashboards/cost-tracking.json
{
  "targets": [{
    "expr": "orchestrator_cost_per_task_seconds"  // ❌ This metric doesn't exist
  }]
}
```

Fix: Either:
1. Implement actual cost metrics (track API calls, compute time)
2. Remove dashboard or mark as "deprecated"

---

## Alert Rules Verification

### Claim: "11 alert rules with smart deduplication"

**Status:** ✅ **CONFIRMED** - 11 rules exist

**Alert Rules Found:**

| Alert | Severity | Condition | Threshold |
|-------|----------|-----------|-----------|
| HighErrorRate | critical | error_rate > 10% | 5min |
| SlowKBQuery | warning | query_latency_p95 > 1s | 5min |
| TaskQueueBacklog | warning | queue_length > 100 | 10min |
| ApprovalPending | info | approval_queue_length > 0 | 1h |
| DatabaseConnError | critical | connections_lost > 0 | 1min |
| AlertFlood | warning | alerts_received > 100/min | 2min |
| MemoryLeak | warning | heap_usage > 80% | 5min |
| DiskFull | critical | disk_usage > 90% | 1min |
| ServiceDown | critical | up == 0 | 1min |
| RateLimitExceeded | warning | rate_limit_hits > 100 | 5min |
| ConsolidationFailed | critical | consolidation_errors > 0 | 5min |

**Deduplication Verification:** ✅ **WORKS**

Code:
```typescript
const fingerprint: AlertFingerprint = {
  alertName,
  cause,
  agent,
  labels: alert.labels,
};

if (!alertDeduplicator.shouldFire(fingerprint)) {
  console.debug('Alert deduplicated');
  return;  // ✅ Prevents duplicate notifications
}
```

**Deduplication Window:** 10 minutes (hardcoded)

**Issues:**
- ❌ Dedup window not configurable
- ❌ No dedup metrics (can't see how many alerts were suppressed)
- ❌ AlertManager also has dedup (double dedup = inefficient)

---

## Monitoring Coverage Gaps

| Component | Has Metrics | Has Alerts | Has Dashboard | Gap |
|-----------|------------|-----------|----------------|-----|
| Orchestrator | ✅ 16 | ✅ 11 | ✅ 3 | Minor |
| MongoDB | ❌ 0 | ❌ 0 | 🚨 **NONE** | **CRITICAL** |
| Redis | ❌ 0 | ❌ 0 | 🚨 **NONE** | **CRITICAL** |
| Node.js Runtime | ⚠️ default | ❌ optional | ✅ Grafana default | OK |
| Knowledge Base | ✅ 2 metrics | ❌ 0 | ⚠️ Minimal | High |
| Network (HTTP) | ❌ 0 | ❌ 0 | ❌ None | CRITICAL |
| Disk Space | ❌ 0 | ❌ 0 | ❌ None | HIGH |

**Critical Monitoring Gaps:**

1. **MongoDB Monitoring Missing**
   - Can't see: Query latency, collection sizes, index usage, replication lag
   - Alert: Database down only detected via connection error, not actual health

2. **Redis Monitoring Missing**
   - Can't see: Memory usage, hit rate, eviction count
   - Alert: No alert for Redis full

3. **HTTP Endpoint Monitoring Missing**
   - Can't see: Response times by endpoint, error rates
   - Alert: No alert for /api/persistence/export taking >5 seconds

4. **Knowledge Base Monitoring Minimal**
   - Only KB count, not query success rate
   - No alert for KB queries failing

---

## Alert Rule Quality Issues

### Issue: AlertManager Requires Webhook Acknowledgment

**Problem:**
```yaml
# monitoring/alertmanager.yml
receivers:
  - name: 'orchestrator-webhook'
    webhook_configs:
      - url: 'http://localhost:3000/webhook/alerts'
        send_resolved: false  # ❌ Never sends "resolved" alerts
```

**Impact:** Can't distinguish between:
- Alert still firing
- Alert firing but system didn't receive notification

**Fix:**
```yaml
webhook_configs:
  - url: 'http://localhost:3000/webhook/alerts'
    send_resolved: true  # ✅ Send both firing and resolved
```

### Issue: Missing Alert for "Metrics Not Flowing"

**Problem:** If Prometheus can't scrape `/metrics` endpoint (401, timeout, etc.), no alert fires

**Solution:** Add alert:
```yaml
- alert: MetricsScrapeFailed
  expr: up{job="orchestrator"} == 0
  for: 2m
  severity: critical
```

---

## Prometheus Configuration Issues

### Issue: Scrape Interval vs Alert Evaluation

**Evidence:**
```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
```

**Problem:** If scrape fails, alert evaluates on 15-second-old data
- Metric timestamp 15s old when alert fires
- Operations team doesn't know if issue is current or past

**Fix:** Add metadata:
```yaml
evaluation_interval: 15s  # Keep same
alerting:
  alert_relabel_configs:
    - source_labels: [__value__]  # Add alert timestamp
      target_label: alert_timestamp
```

---

## Observability Recommendations

### Tier 1: Critical (Add Immediately)

- [ ] Add MongoDB metrics scraper (using mongo-exporter)
- [ ] Add Redis exporter
- [ ] Add HTTP endpoint response time metrics
- [ ] Add disk space monitoring (node-exporter)
- [ ] Fix cost dashboard (remove fake data or implement metrics)
- [ ] Add "metrics not flowing" alert

### Tier 2: High Priority

- [ ] Dashboard for MongoDB (queries, collections, indexes)
- [ ] Dashboard for Redis (memory, hit rate)
- [ ] Knowledge base success rate metric
- [ ] Rate limit hit counter metric
- [ ] Add configurable dedup window

### Tier 3: Nice to Have

- [ ] Distributed tracing (Jaeger/Zipkin)
- [ ] Custom business metrics (e.g., "incidents resolved/day")
- [ ] SLI/SLO reporting dashboard

---

## Summary

| Category | Status | Issues |
|----------|--------|--------|
| **Metrics** | ✅ Exist | Cardinality, gaps |
| **Dashboards** | ⚠️ Exist | 1 uses fake data |
| **Alerts** | ✅ Exist | Missing coverage |
| **MongoDB** | ❌ MISSING | CRITICAL |
| **Redis** | ❌ MISSING | CRITICAL |
| **Disk** | ❌ MISSING | HIGH |

**Conclusion:** Observability for orchestrator is decent, but critical infrastructure (DB, cache, disk) is completely blind.
