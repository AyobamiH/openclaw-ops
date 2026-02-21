# Error Alerting Setup Guide

## Overview

The orchestrator includes a built-in error alerting system that tracks task failures and sends alerts to Slack, email, or logs.

## Configuration

### Environment Variables

Set these to enable alerting:

```bash
# Enable/disable alerts (default: true)
export ALERTS_ENABLED=true

# Slack webhook for error alerts
export SLACK_ERROR_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Email configuration (optional)
export ALERT_EMAIL_TO=ops@example.com
export EMAIL_API_URL=https://your-email-service.com/send
export EMAIL_API_KEY=your-api-key

# Alert severity threshold: 'info', 'warning', 'error' (default: warning)
export ALERT_SEVERITY_THRESHOLD=error
```

### Configure in orchestrator_config.json

After setting environment variables, the AlertManager will automatically build its config on startup.

## Alert Types

### Critical Alerts 🔴
- Orchestrator heartbeat missed (>15 min)
- Task failed 3+ times in a row
- Nightly batch completely failed
- Digest notification failed to send

**Action**: Immediate intervention required. System may be hung.

**Example Slack message**:
```
attachment:
  color: #FF0000 (danger)
  title: ⚠️  CRITICAL - task-nightly-batch
  text: Task failed 3 times in a row: Cannot read digest...
```

### Error Alerts ⚠️
- Individual task failures
- Handler exceptions
- File I/O errors
- LLM API timeouts

**Action**: Investigate and fix. System is partially degraded.

**Example Slack message**:
```
attachment:
  color: #FFAA00 (warning)
  title: ⚠️  ERROR - task-send-digest
  text: Notification could not be sent: Slack webhook unreachable
```

### Warning Alerts ⚠️
- Low queue items
- Old digest files
- Slow handler performance

**Action**: Monitor and prepare for issues.

### Info Alerts ℹ️
- Task completions (when enabled)
- State changes

**Action**: Informational only.

## Setting Up Slack Alerts

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name: "OpenClaw Alerter"
4. Select your workspace

### 2. Enable Incoming Webhooks

1. In your app settings, go to "Incoming Webhooks"
2. Toggle "Activate Incoming Webhooks" to ON
3. Click "Add New Webhook to Workspace"
4. Select channel: `#alerts` (or your preferred channel)
5. Copy the webhook URL

### 3. Configure Orchestrator

```bash
export SLACK_ERROR_WEBHOOK=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX
```

### 4. Start Orchestrator

```bash
cd orchestrator
npm run dev
```

On the first error:
1. Check your Slack channel `#alerts`
2. You should see a formatted error message
3. Click the message to see context (task ID, error message, stack trace)

## Setting Up Email Alerts

### Using SendGrid

```bash
export ALERT_EMAIL_TO=ops@example.com
export EMAIL_API_URL=https://api.sendgrid.com/v3/mail/send
export EMAIL_API_KEY=SG.your-api-key-here
```

### Using Mailgun

```bash
export ALERT_EMAIL_TO=ops@example.com
export EMAIL_API_URL=https://api.mailgun.net/v3/your-domain/messages
export EMAIL_API_KEY=your-mailgun-api-key
```

## Alert Policies

### Failure Tracking

The orchestrator tracks consecutive failures per task type:

- **1st failure**: Logged only
- **2nd failure**: Error alert sent
- **3rd+ failure**: Critical alert, escalated

Example scenario:
```
[1/3] send-digest fails (no webhook)
      → Logged to orchestrator.log

[2/3] send-digest fails (webhook still down)
      → Error alert sent to Slack

[3/3] send-digest fails (still down)
      → Critical alert, plus escalated to email
      → Failure counter reset after 1 hour
```

### Heartbeat Monitoring

Every 5 minutes, orchestrator enqueues a heartbeat task:

```
[heartbeat] periodic task every 5 min
[alert] If heartbeat missing >15 min → system is hung
```

System checks for hung heartbeat every 10 minutes.

## Common Scenarios

### Scenario 1: LLM API Down

**Alert Flow**:
1. `reddit-response` task tries to call gpt-4 → timeout
2. Task fails → logged
3. Second failure → Error alert to Slack
4. Third failure → Critical alert + email

**Resolution**:
```bash
# Check OpenAI status
curl https://status.openai.com/

# Verify API key
echo $OPENAI_API_KEY

# Check orchestrator logs
tail -50 logs/orchestrator.log | grep "openai\|gpt-4"
```

### Scenario 2: Slack Webhook Invalid

**Alert Flow**:
1. `send-digest` sends notification to invalid webhook → 404 error
2. Task fails but digest is still created
3. User sees error in logs but no Slack notification

**Resolution**:
```bash
# Test webhook manually
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"Test"}' \
  $SLACK_ERROR_WEBHOOK

# If that fails, regenerate webhook URL
# Go to Slack API → Your App → Incoming Webhooks → Regenerate
```

### Scenario 3: Orchestrator Runs Out of Memory

**Alert Flow**:
1. Memory usage increases during batch processing
2. Node.js process crashes (SIGKILL or out-of-memory error)
3. Heartbeat stops being enqueued
4. Alert: "Heartbeat missed >15 min"

**Resolution**:
```bash
# Check memory usage during batch
watch -n 1 'ps aux | grep orchestrator | grep -v grep'

# Reduce batch size or optimize handlers
# Update orchestrator_config if necessary

# Restart orchestrator
cd orchestrator && npm run dev
```

## Alert Dashboard

View recent alerts:

```bash
# Get all alerts from last 24 hours
cat orchestrator_state.json | jq '.alerts | length'

# See recent failures
tail -50 logs/orchestrator.log | grep "ERROR\|CRITICAL"
```

## Disabling Alerts

To disable specific alert types or the entire system:

```bash
# Disable all alerts
export ALERTS_ENABLED=false

# Only receive critical alerts
export ALERT_SEVERITY_THRESHOLD=critical
```

## Integrating with Existing Monitoring

### PagerDuty

Add critical alerts to PagerDuty:

```bash
# After setting up Slack alerts, use Slack → PagerDuty integration
# In Slack: Choose "Settings" → "Integrations" → "PagerDuty"
```

### Datadog

Collect orchestrator logs:

```bash
# Export JSON logs to Datadog
curl -X POST https://http-intake.logs.datadoghq.com/v1/input \
  -H "DD-API-KEY: $DATADOG_API_KEY" \
  -d @logs/orchestrator.log
```

### Custom Webhooks

The alerter uses standard HTTP webhooks:

```bash
# Any service accepting POST with JSON payload
export ALERT_WEBHOOK_URL=https://your-service.com/alerts
```

## Troubleshooting

### No alerts received

1. Check if alerts are enabled: `echo $ALERTS_ENABLED`
2. Verify webhook URL is valid: `curl -X POST $SLACK_ERROR_WEBHOOK`
3. Check orchestrator logs: `npm run dev 2>&1 | grep alert`
4. Ensure task is actually failing (not just logging)

### Alerts too noisy

- Increase severity threshold: `export ALERT_SEVERITY_THRESHOLD=error`
- Reduce failure tolerance: Adjust `maxFailuresBeforeAlert` in code
- Filter unimportant tasks: Update alert manager rules

### Alerts not delivered to Slack

```bash
# Webhook might be rate-limited, try again:
curl -X POST $SLACK_ERROR_WEBHOOK -d '{"text":"test"}'

# If 429, wait 1 minute and retry
# If 403/401, regenerate webhook

# Check workspace permissions
# Slack → Your App → OAuth & Permissions → Scopes
```

## Deployment Checklist

- [ ] Set `SLACK_ERROR_WEBHOOK` in production environment
- [ ] Set `ALERTS_ENABLED=true`
- [ ] Test with a manual task failure
- [ ] Verify Slack message appears in alert channel
- [ ] Set up daily alert summary email (optional)
- [ ] Add orchestrator logs to log aggregation service
- [ ] Configure backup alerting (email) in case Slack fails
- [ ] Document escalation procedures for critical alerts
- [ ] Set up on-call rotation to respond to alerts
