# Monitoring the Nightly Batch System

## Overview

The orchestrator runs three scheduled tasks:
- **11:00 PM UTC** (`nightlyBatchSchedule`): Nightly batch collection and marking
- **6:00 AM UTC** (`morningNotificationSchedule`): Send digest notification
- **Every 5 min** (`heartbeat`): Health checks

## Real-Time Monitoring

### 1. **Watch Orchestrator Logs**

Start the orchestrator and monitor output:

```bash
cd orchestrator
npm run dev
```

**Expected output at 11pm UTC:**
```
[orchestrator] 🔄 Running nightly-batch task...
[orchestrator] ✅ nightly batch: synced 0 docs, marked 3 for draft
```

**Expected output at 6am UTC:**
```
[orchestrator] 🔄 Running send-digest task...
[notifier-log] ✅ Notification logged (3 leads)
[orchestrator] ✅ digest notification sent (3 leads)
```

### 2. **Check Digest Files**

After 11pm batch completes, verify digest was created:

```bash
ls -lah logs/digests/digest-*.json
cat logs/digests/digest-2026-02-21.json | jq .summary
```

Expected output:
```json
{
  "docsProcessed": 0,
  "queueTotal": 3,
  "markedForDraft": 3
}
```

### 3. **Check Task History**

View completed tasks:

```bash
cat orchestrator_state.json | jq '.taskHistory[-5:]'
```

Look for entries like:
```json
{
  "type": "nightly-batch",
  "result": "ok",
  "message": "nightly batch: synced 0 docs, marked 3 for draft"
}
```

### 4. **Monitor Slack/Discord Notifications**

If configured with Slack webhook:

- Look for messages in your configured Slack channel at **6:05 AM UTC**
- Message format:
  ```
  📨 🚀 3 Reddit Leads Ready for Review
  Your nightly RSS sweep collected 3 leads.
  3 high-confidence items (score > 0.75) are ready for drafting.
  ```

### 5. **Check System Resource Usage**

Monitor CPU/memory during 11pm batch:

```bash
# In separate terminal
watch -n 1 'ps aux | grep orchestrator'
```

Expected: Peak usage ~10-30sec, then idle

## Automating Monitoring

### **Watch Mode (Local Development)**

```bash
# Terminal 1: Run orchestrator
cd orchestrator && npm run dev

# Terminal 2: Watch digest files
watch -n 5 'ls -lah logs/digests/'

# Terminal 3: Watch state changes
watch -n 5 'cat orchestrator_state.json | jq ".lastNightlyBatchAt, .lastDigestNotificationAt"'
```

### **Log Aggregation (Production)**

Set up log collection from:
- `/logs/orchestrator.log` (main orchestrator logs)
- `/logs/digests/digest-*.json` (digest files)
- `/logs/reddit-drafts.jsonl` (reddit drafts)

Example with `tail`:
```bash
tail -f logs/orchestrator.log | grep -E "nightly-batch|send-digest"
```

### **Alerting Integration**

Configure your monitoring system to alert on:
- ❌ `nightly-batch` fails (missing digest file)
- ❌ `send-digest` fails (notification not sent)
- ❌ No heartbeat for >10 minutes (orchestrator crashed)
- ⚠️ Digest created but empty (`markedForDraft === 0`)

## Common Issues & Recovery

### Issue: No digest file created after 11pm

**Diagnosis:**
```bash
tail -50 logs/orchestrator.log | grep -i "error\|failed"
cat orchestrator_state.json | jq '.taskHistory[-3:]'
```

**Solutions:**
1. Check config: `digestDir` must be writable
2. Check state: `redditQueue` must have items
3. Verify cron: `npm run dev` should log "Scheduled 3 cron jobs"

### Issue: Notification sent but no message in Slack

**Diagnosis:**
```bash
# Check if channel/webhook configured
cat orchestrator_config.json | jq '.digestNotificationChannel, .digestNotificationTarget'

# Check for notifier errors
tail -20 logs/orchestrator.log | grep notifier
```

**Solutions:**
1. Verify webhook URL is valid (test with curl)
2. Check environment: `echo $SLACK_WEBHOOK_URL`
3. Fallback to log channel: `digestNotificationChannel: "log"`

### Issue: Batch runs too long (>60sec)

**Diagnosis:**
```bash
# Check reddit queue size
cat orchestrator_state.json | jq '.redditQueue | length'

# Check pending docs
cat orchestrator_state.json | jq '.pendingDocChanges | length'
```

**Solutions:**
1. Trim queue: manually delete old items if > 200
2. Batch in smaller chunks: adjust score threshold from 0.75 to 0.80
3. Verify LLM performance: check `logs/reddit-drafts.jsonl` for latency

## Performance Metrics

Typical performance (100 items in queue, 50 marked for draft):

| Metric | Expected | Alert if |
|--------|----------|----------|
| Batch duration | 10-30 sec | > 2 min |
| Items marked | ~50-100 | = 0 |
| Digest file size | 5-50 KB | > 1 MB |
| Notification latency | < 5 sec | > 30 sec |
| Heartbeat frequency | 5 min intervals | > 10 min gap |

## Manual Testing

### Test Nightly Batch

```bash
npx tsx test-nightly-batch.ts
```

Expected output:
```
✨ Test PASSED - Digest created successfully!
```

### Test Send-Digest

```bash
npx tsx test-send-digest.ts
```

Expected output:
```
✨ Test PASSED - Notification delivery tested!
```

### Trigger Batch On-Demand

```bash
# Edit orchestrator/src/index.ts temporarily to run immediately:
# queue.enqueue("nightly-batch", { reason: "manual" });
npm run dev
```

## Next Steps

- [ ] Set up log rotation for `/logs/digests/`
- [ ] Configure Slack webhook in production
- [ ] Add Prometheus metrics (optional)
- [ ] Set up Sentry for error tracking
- [ ] Create dashboard for digest delivery
