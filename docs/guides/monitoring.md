---
title: "Monitoring & Observability"
summary: "Check system health and observe what the orchestrator is doing."
---

# Monitoring & Observability

Use this guide for runtime health, scheduled-task visibility, and alerting. This
is the canonical monitoring document; the old root `MONITORING.md` and
`ERROR_ALERTS.md` surfaces are absorbed here.

## Canonical Paths

The default configured paths are:

- state file: `orchestrator_state.json`
- logs directory: `logs/`
- digest output: `logs/digests/`

When local configuration changes those paths, follow `orchestrator_config.json`.

## Live Logs

```bash
tail -f logs/orchestrator.log
grep "heartbeat" logs/orchestrator.log | tail -10
grep "error\\|ERROR" logs/orchestrator.log
```

## State Checks

The orchestrator persists current runtime state to `orchestrator_state.json`.

```bash
cat orchestrator_state.json | jq
cat orchestrator_state.json | jq '.lastStartedAt'
cat orchestrator_state.json | jq '.taskHistory | length'
cat orchestrator_state.json | jq '.taskHistory[-5:]'
```

Useful fields to watch:

- `lastStartedAt`
- `taskHistory`
- `redditResponses`
- `rssDrafts`
- `driftRepairs`
- `deployedAgents`

## Heartbeat Health

Heartbeats are expected every 5 minutes.

```bash
cat orchestrator_state.json | jq '.taskHistory[] | select(.type=="heartbeat") | .timestamp' | tail -1
```

If the latest heartbeat is stale, treat it as a runtime health warning and
check process liveness immediately.

## Scheduled Task Monitoring

The default recurring tasks are:

- `nightly-batch`
- `send-digest`
- `heartbeat`

Watch the relevant events:

```bash
grep -E "nightly-batch|send-digest|heartbeat" logs/orchestrator.log | tail -20
cat orchestrator_state.json | jq '.taskHistory[-10:]'
ls -lah logs/digests/digest-*.json
```

When `nightly-batch` runs, verify:

- a digest file was created in `logs/digests/`
- the task appears in `taskHistory`
- the next `send-digest` task completed or logged a clear failure

## Task And Agent Visibility

```bash
cat orchestrator_state.json | jq '.taskHistory[] | select(.result=="error")'
cat orchestrator_state.json | jq '.taskHistory[] | select(.type=="drift-repair" or .type=="reddit-response")'
cat orchestrator_state.json | jq '.deployedAgents'
```

This gives you recent failures, agent-heavy task flows, and the current
deployment memory tracked by the runtime.

## Alerts

The orchestrator supports built-in alerting for failure accumulation and
critical runtime problems.

Common environment variables:

```bash
export ALERTS_ENABLED=true
export ALERT_SEVERITY_THRESHOLD=error
export SLACK_ERROR_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
export ALERT_EMAIL_TO=ops@example.com
export EMAIL_API_URL=https://your-email-service/send
export EMAIL_API_KEY=your-api-key
```

Alert behavior to expect:

- repeated task failures escalate in severity
- missed heartbeat windows should be treated as critical
- notification delivery failures should still appear in logs even when the
  external channel fails

## Quick Health Pass

```bash
ps aux | grep "node\\|tsx" | grep -v grep
ls -la logs/
stat orchestrator_state.json
cat orchestrator_state.json | jq '.taskHistory[] | select(.type=="heartbeat") | .timestamp' | tail -1
```

## Common Failure Patterns

- No heartbeat for more than 10-15 minutes:
  check if the orchestrator process is down or hung.
- Missing digest file after `nightly-batch`:
  check `logs/orchestrator.log` and `orchestrator_state.json` for batch errors.
- Notification expected but nothing arrived:
  verify webhook/email configuration and look for notifier errors in the log.
- State file or log growth looks abnormal:
  inspect `taskHistory`, queue-related arrays, and artifact retention.

## Escalation Rule

When runtime health looks wrong:

1. Check process liveness.
2. Check the latest heartbeat.
3. Check the most recent failing task record.
4. Inspect notifier errors if alerts did not arrive.
5. Use [Common Issues](../troubleshooting/common-issues.md) and
   [Debugging](../troubleshooting/debugging.md) for deeper recovery.
