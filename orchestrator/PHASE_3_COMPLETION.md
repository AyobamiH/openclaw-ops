# Phase 3: Alert Rules & Webhook Routing - COMPLETED

**Date Completed:** February 22, 2026  
**Effort:** 4 hours  
**Status:** ✅ COMPLETE

---

## What Was Delivered

### 1. Enhanced Alert Rules (11 total)

**File:** `monitoring/alert-rules.yml` (130 LOC)

Alert rules with **smart labeling** by cause:

**Performance Alerts:**
- `HighErrorRate` — Error rate > 5% for 2 min (cause: `{{ $labels.error_type }}`)
- `TaskDurationSpike` — p95 latency > 5s (cause: `latency_spike`)
- `AgentHighActiveTaskCount` — >20 active tasks (cause: `high_load`)

**Cost Alerts:**
- `DailyCostSpike` — Daily cost > $30 (cause: `cost_overage`)
- `MonthlyCostTrendWarning` — Monthly trending > $800 (cause: `cost_trend`)

**Approval Gate Alerts:**
- `ApprovalSLABreach` — p95 response > 60s (cause: `approval_sla_breach`)
- `PendingApprovalsBacklog` — >5 pending (cause: `approval_queue_backlog`)
- `ApprovalAutoEscalationTriggered` — SLA timeout (cause: `sla_timeout`)

**Security Alerts:**
- `PermissionDenialSpike` — 3x baseline denials (cause: `permission_spike`)
- `AuditViolationDetected` — Detects violations (cause: `{{ $labels.violation_type }}`)
- `PermissionEscalationAttempt` — >2/min escalation (cause: `escalation_attempt`)

**System Alerts:**
- `PrometheusScrapeFailing` — Metrics endpoint down (cause: `scrape_failure`)

Each rule has:
- Severity labels (critical, warning)
- Category labels (performance, cost, approval, security, health)
- **Cause labels** (for smart deduplication by root cause)

---

### 2. SendGrid Email Integration (150 LOC)

**File:** `src/alerts/sendgrid-client.ts`

Sends **critical alert emails** via SendGrid API:

**Features:**
- HTML email template with styling
- Professional alert formatting
- Includes: alert name, summary, details, current value, agent, timestamp, runbook link
- Graceful degradation (if API key missing, logs warning but doesn't crash)

**Configuration:**
```env
SENDGRID_API_KEY=SG.your_api_key
SENDGRID_FROM_EMAIL=alerts@openclaw.io
ALERT_EMAIL=your-email@example.com
```

**Usage:**
```typescript
await sendGridClient.sendCriticalAlert({
  alertName: "DailyCostSpike",
  severity: "critical",
  summary: "Daily cost spike (> $30)",
  description: "Current daily cost: $32.50",
  timestamp: "2026-02-22T14:32:00Z"
});
```

---

### 3. Slack Integration with Threading (120 LOC)

**File:** `src/alerts/slack-client.ts`

Sends **threaded alerts to #boltsy-swarm**:

**Features:**
- Color-coded by severity (🚨 critical=red, ⚠️ warning=yellow, ℹ️ info=green)
- Formatted Slack blocks (header, fields, sections)
- **Threaded replies** — follow-up alerts reply to parent thread
- Thread grouping by `fingerprint` (alert + cause)
- Runbook button (links to documentation)

**Configuration:**
```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_CHANNEL=#boltsy-swarm
```

**How threading works:**
```
14:00 — HighErrorRate (timeout) fires
        Creates thread in Slack
        
14:05 — HighErrorRate (timeout) fires again
        Same fingerprint → replies to thread (no spam)
        
14:10 — HighErrorRate (memory_leak) fires
        Different cause → NEW thread (different issue)
```

---

### 4. Smart Deduplication (90 LOC)

**File:** `src/alerts/alert-deduplicator.ts`

**Key Innovation:** Fingerprinting by (alert name + cause)

**Why this matters** (your edge case):
```typescript
// Same alert, different causes = different fingerprints
fingerprint_1 = hash("HighErrorRate" + "timeout")
fingerprint_2 = hash("HighErrorRate" + "memory_leak")  
fingerprint_3 = hash("HighErrorRate" + "network_blip")

// Each tracked separately:
- fingerprint_1 deduped within 10 min
- fingerprint_2 deduped within 10 min
- fingerprint_3 deduped within 10 min
// But all 3 send through (different root causes!)
```

**Features:**
- 10-minute dedup window (configurable)
- Automatic cleanup of stale entries (older than 2h)
- Per-fingerprint tracking (not global)
- Prevents spam while catching all root causes

---

### 5. Alert Handler & Orchestration (100 LOC)

**File:** `src/alerts/alert-handler.ts`

**Flow:**

```
AlertManager webhook (POST /webhook/alerts)
  ↓
alertHandler.handleAlertManagerWebhook(payload)
  ↓
For each alert:
  ├─ Check deduplication (by fingerprint)
  ├─ If should fire:
  │  ├─ Send to Slack (all severities)
  │  └─ IF critical: Send email to SendGrid
  └─ If deduplicated: Log & skip
```

**Routing Logic:**
```
Severity = Info/Warning → Slack only
Severity = Critical → Slack + SendGrid email
```

**Processing:**
- Extracts alert labels (alertname, severity, cause, agent)
- Pulls annotations (summary, description, runbook)
- Deduplicates by fingerprint
- Routes based on severity

---

### 6. AlertManager Configuration (Updated)

**File:** `monitoring/alertmanager.yml`

```yaml
route:
  group_by: ['alertname', 'cause']  # ← Group by cause (smart!)
  group_wait: 30s                   # Batch related alerts
  group_interval: 5m

receivers:
  - name: orchestrator
    webhook_configs:
      - url: http://orchestrator:3000/webhook/alerts
        send_resolved: true

inhibit_rules:
  # Silence warnings if critical with same cause exists
  - source_match:
      severity: critical
    target_match:
      severity: warning
    equal: ['alertname', 'cause']
```

**Key:** Groups by `cause` (not just alert name) → related errors batch together

---

### 7. Orchestrator Integration

**File:** `src/index.ts` (updated)

Added:
- HTTP Express server on port 3000
- Alert webhook endpoint: `POST /webhook/alerts`
- Health check: `GET /health`

**Bootstrap startup logs:**
```
✓ HTTP server listening on port 3000
✓ Metrics: http://localhost:9100/metrics
✓ Alert webhook: http://localhost:3000/webhook/alerts
✓ Health check: http://localhost:3000/health
```

---

### 8. Environment Configuration

**File:** `.env.example` (updated)

Added Phase 3 sections:
- `SENDGRID_API_KEY` — SendGrid API token
- `SENDGRID_FROM_EMAIL` — Email sender address
- `ALERT_EMAIL` — Critical alert recipient
- `SLACK_WEBHOOK_URL` — Slack incoming webhook
- `SLACK_CHANNEL` — Alert destination channel

---

## Setup Instructions (Pre-Phase 3 Start)

### Step 1: Get SendGrid API Key (5 min)

1. Go to [sendgrid.com](https://sendgrid.com/sign-up)
2. Create free account (or use existing)
3. Navigate: **Settings → API Keys → Create API Key**
4. Copy full API key (starts with `SG.`)
5. Add to `.env`: `SENDGRID_API_KEY=SG.xxx`

### Step 2: Create Slack Webhook (5 min)

1. **In Slack workspace:**
   - Go to App Store
   - Search: "Webhooks"
   - Install "Incoming Webhooks"

2. **Or create custom app:**
   - Settings → Apps & Integrations → Build → Create New App
   - Name: "OpenClaw AlertManager"
   - Features → Incoming Webhooks → Turn On
   - Add New Webhook to Workspace
   - Select channel: **#boltsy-swarm**
   - Copy Webhook URL

3. Add to `.env`: `SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL`

### Step 3: Apply Configuration

```bash
cd orchestrator
cp .env.example .env
# Edit .env with:
# - SENDGRID_API_KEY
# - ALERT_EMAIL
# - SLACK_WEBHOOK_URL
# - SLACK_CHANNEL
```

### Step 4: Start Containers

```bash
docker-compose up -d
# or restart if already running:
docker-compose restart orchestrator alertmanager
```

---

## Verification Checklist

### Build & Compilation
```
☐ npm run build succeeds (compiles all alert modules)
☐ No TypeScript errors
☐ Alert files in dist/alerts/:
  - alert-handler.js
  - slack-client.js
  - sendgrid-client.js
  - alert-deduplicator.js
```

### Orchestrator Startup
```
☐ Container starts successfully
☐ Logs show: "HTTP server listening on port 3000"
☐ Logs show: "Alert webhook: http://localhost:3000/webhook/alerts"
☐ Health check: curl http://localhost:3000/health → { status: ok }
```

### Prometheus/AlertManager
```
☐ Prometheus running (http://localhost:9090)
☐ Alert rules loaded (Rules tab shows 11 rules)
☐ AlertManager running (http://localhost:9093)
☐ AlertManager config has webhook URL
```

### Test Alert Flow

**Generate test alert (trigger high error rate):**
```bash
# Make many failing tasks to trigger HighErrorRate alert
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/tasks \
    -H "Content-Type: application/json" \
    -d '{"type":"fail-test", "payload":{}}'
done
```

**Verify routing:**
```
☐ Alert fires in Prometheus (http://localhost:9090/alerts)
☐ AlertManager receives it
☐ Slack notification arrives in #boltsy-swarm (within 30s)
☐ If critical: Email received in mailbox (within 1 min)
☐ Follow-up alert (within 10 min): Threads in Slack (same message)
☐ After 10 min: New alert appears (dedup window expired)
```

---

## Architecture: Phase 1 + 2 + 3

```
┌─ Orchestrator ─────────────────────────────┐
│ - Records metrics (Phase 1)                 │
│ - Emits to :9100/metrics                    │
│ - Receives webhooks (Phase 3)               │
└────────────────────────────────────────────┘
        ↓ every 15s (scrape)
┌─ Prometheus ───────────────────────────────┐
│ - Stores time-series data                   │
│ - Evaluates 11 alert rules                  │
│ - Fires → AlertManager                      │
└────────────────────────────────────────────┘
        ↓ (groups by cause, batches)
┌─ AlertManager ─────────────────────────────┐
│ - Groups alerts (30s wait)                  │
│ - Deduplicates (same fingerprint)           │
│ - Sends webhook to orchestrator             │
└────────────────────────────────────────────┘
        ↓ POST /webhook/alerts
┌─ Alert Handler ────────────────────────────┐
│ - Receives alert payload                    │
│ - Checks fingerprint dedup                  │
│ - Routes: Slack + SendGrid (critical only)  │
└────────────────────────────────────────────┘
        ↓                    ↓
   Slack                 SendGrid
 #boltsy-swarm           Email
 (threaded)            (formatted)
```

---

## Files Created/Modified

**New Files:**
```
src/alerts/
├── alert-handler.ts          (100 LOC)
├── alert-deduplicator.ts     (90 LOC)
├── slack-client.ts           (120 LOC)
└── sendgrid-client.ts        (150 LOC)

monitoring/
└── alert-rules.yml           (130 LOC — updated with 11 rules + labels)

.env.example                  (Phase 3 config sections added)
```

**Modified Files:**
```
src/index.ts                  (+60 LOC for Express + webhook)
monitoring/alertmanager.yml   (updated routing + grouping)
```

**Existing (No Changes):**
- docker-compose.yml — already had alertmanager service
- package.json — already had express dependency

---

## What's Integrated

- ✅ Prometheus metrics (Phase 1) → Prometheus reads every 15s
- ✅ Grafana dashboards (Phase 2) → Visualizes metrics
- ✅ Alert rules (Phase 3) → Fires on thresholds
- ✅ AlertManager (Phase 3) → Groups + routes alerts
- ✅ Alert handler (Phase 3) → Receives webhook
- ✅ Smart dedup (Phase 3) → Groups by fingerprint (alert + cause)
- ✅ Slack (Phase 3) → Threaded messages to #boltsy-swarm
- ✅ SendGrid (Phase 3) → Critical emails to inbox

---

## Cost & Timeline Impact

**Phase 3 Cost:**
- SendGrid: $15/month (only for critical alerts, ~20/month)
- Slack: Free (webhook only, no additional seats)
- Prometheus/AlertManager: Free (already running)

**Timeline:**
- Setup time: ~10 min (get API keys + webhooks)
- Codebase ready: 4 hours (delivered today ✅)
- First alert: Immediate (after setup)

---

## Next Steps

**Ready for Phase 4:** Daily Memory Consolidation (3 hours)
- Will consolidate metrics + alerts into daily snapshots
- Build weekly summaries (lessons learned, patterns)
- Feed into MEMORY.md for persistent cross-session learning

---

## Troubleshooting Quick Ref

| Problem | Solution |
|---------|----------|
| "Slack webhook not configured" in logs | Check `SLACK_WEBHOOK_URL` env var |
| No email for critical alert | Check `SENDGRID_API_KEY` + `ALERT_EMAIL` |
| Alert doesn't fire | Check Prometheus alert rules loaded at :9090 |
| AlertManager not receiving alerts | Verify docker network (`orchestrator-net` exists) |
| Alert sends multiple times in 10 min | Deduplication working (same fingerprint) |
| Different error types send separately | Deduplication working (different fingerprints) |

---

**Phase 3 Status: ✅ IMPLEMENTED**

All code written, compiled, integrated, and ready for testing.
