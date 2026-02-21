# Quick Reference: Deploying Nightly Batch System

## 🚀 Start Orchestrator

```bash
cd /home/oneclickwebsitedesignfactory/.openclaw/workspace/orchestrator
npm install                    # If not already done
npm run build                  # Compile TypeScript
npm run dev                    # Start orchestrator
```

**Expected output**:
```
[orchestrator] config loaded { ... }
[orchestrator] indexed 698 docs
[orchestrator] alerts enabled: true
[orchestrator] 🔔 Alerts configured and monitoring started
[orchestrator] Scheduled 3 cron jobs: nightly-batch (11pm), send-digest (6am), heartbeat (5min)
[orchestrator] Processing task: startup
[orchestrator] ✅ startup: orchestrator boot complete
```

---

## 📋 Verify System Working

### Test 1: Nightly Batch Handler
```bash
npx tsx test-nightly-batch.ts
```

Expected: `✨ Test PASSED - Digest created successfully!`

Check digest:
```bash
ls -lah logs/digests/
cat logs/digests/digest-*.json | jq '.summary'
```

### Test 2: Send Digest Notification
```bash
npx tsx test-send-digest.ts
```

Expected: `✨ Test PASSED - Notification delivery tested!`

---

## 🔔 Enable Slack Alerts

### Step 1: Create Slack Webhook
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. "Create New App" → "From scratch"
3. Name: "OpenClaw Alerter"
4. Go to "Incoming Webhooks" → "Add New Webhook to Workspace"
5. Select channel (e.g., `#alerts`)
6. Copy webhook URL

### Step 2: Set Environment Variable
```bash
export SLACK_ERROR_WEBHOOK=https://hooks.slack.com/services/T00000000/B00000000/XXXXX
```

### Step 3: Start Orchestrator
```bash
cd orchestrator && npm run dev
```

### Step 4: Test Alert
- Wait for a task failure (or manually trigger one)
- Check `#alerts` channel in Slack
- You should see an error alert

---

## 📊 Monitor System Health

### Watch Logs in Real-Time
```bash
cd orchestrator && npm run dev | grep -E "cron|nightly|digest|ERROR|alert"
```

### Check Digest Files
```bash
# See digest directory
ls -lah logs/digests/

# View latest digest
cat logs/digests/digest-$(date +%Y-%m-%d).json | jq .summary
```

### Check Task History
```bash
# Last 5 tasks completed
cat orchestrator_state.json | jq '.taskHistory[-5:]'
```

### Monitor Alerts
```bash
# See recent alerts in logs
tail -50 logs/orchestrator.log | grep alert
```

---

## 📅 Scheduled Tasks

| Time | Task | What |
|------|------|------|
| **11:00 PM UTC** | `nightly-batch` | Collect leads, mark high-confidence, create digest |
| **6:00 AM UTC** | `send-digest` | Send digest notification (Slack/Discord/Email) |
| **Every 5 min** | `heartbeat` | Health check (ensure system not hung) |

**Configure times** in `orchestrator_config.json`:
```json
{
  "nightlyBatchSchedule": "0 23 * * *",
  "morningNotificationSchedule": "0 6 * * *"
}
```

---

## ⚙️ Configuration

### Set Notification Channel

Edit `orchestrator_config.json`:
```json
{
  "digestNotificationChannel": "slack",
  "digestNotificationTarget": "C1234567890"
}
```

Or:
```json
{
  "digestNotificationChannel": "log",
  "digestNotificationTarget": "console"
}
```

### Set Alert Severity

```bash
# Only critical alerts
export ALERT_SEVERITY_THRESHOLD=critical

# All alerts including info
export ALERT_SEVERITY_THRESHOLD=info

# Default: warning level
export ALERT_SEVERITY_THRESHOLD=warning
```

---

## 🐛 Troubleshooting

### Issue: No digest file created
```bash
tail -50 logs/orchestrator.log | grep -i "error\|nightly-batch"
cat orchestrator_state.json | jq '.redditQueue | length'  # Check queue not empty
```

### Issue: Notification not sent to Slack
```bash
# Test webhook
curl -X POST $SLACK_ERROR_WEBHOOK -d '{"text":"test"}'

# Check logs
tail -20 logs/orchestrator.log | grep notifier
```

### Issue: Orchestrator not responding
```bash
# Check if process running
ps aux | grep orchestrator

# Check if hung (missing heartbeat)
tail -50 logs/orchestrator.log | grep heartbeat
```

---

## 📖 Full Documentation

- **Monitoring**: See `MONITORING.md` for real-time monitoring setup
- **Error Alerting**: See `ERROR_ALERTS.md` for alerting configuration
- **Implementation Details**: See `IMPLEMENTATION_COMPLETE.md` for architecture

---

## ✅ Deployment Checklist

- [ ] Node.js dependencies installed: `npm install`
- [ ] TypeScript compiled: `npm run build`
- [ ] Orchestrator starts: `npm run dev`
- [ ] Manual tests pass: `test-nightly-batch.ts`, `test-send-digest.ts`
- [ ] Slack webhook configured: `export SLACK_ERROR_WEBHOOK=...`
- [ ] Alerts enabled: `export ALERTS_ENABLED=true`
- [ ] Config reviewed: `orchestrator_config.json` has correct times/channels
- [ ] Logs directory writable: `logs/digests/` exists and is writable
- [ ] First batch run completed (wait for 11pm or manually test)
- [ ] Morning notification received (wait for 6am or manually test)

---

**System Status**: 🟢 Ready for Production

All components tested and verified. You can now deploy to your infrastructure.
