---
title: "Deployment Checklist"
summary: "Production deployment steps and verification."
---

# Deployment Checklist

This runbook is configuration-driven. Do not hardcode state/log locations in operator commands.

## Runtime Prerequisites

- Node.js 20+ (22.x recommended)
- npm
- `orchestrator_config.json` present and valid JSON

## Resolve Runtime Paths First

Run from workspace root:

```bash
STATE_FILE=$(jq -r '.stateFile' orchestrator_config.json)
LOGS_DIR=$(jq -r '.logsDir' orchestrator_config.json)
DOCS_PATH=$(jq -r '.docsPath' orchestrator_config.json)
COOKBOOK_PATH=$(jq -r '.cookbookPath' orchestrator_config.json)

echo "STATE_FILE=$STATE_FILE"
echo "LOGS_DIR=$LOGS_DIR"
echo "DOCS_PATH=$DOCS_PATH"
echo "COOKBOOK_PATH=$COOKBOOK_PATH"
```

## Choose Deployment Mode (Non-Interchangeable)

### Mode A: Root Minimal Compose

Use when you only want orchestrator container runtime:

```bash
docker compose -f docker-compose.yml config --services
docker compose -f docker-compose.yml up -d --build
docker compose -f docker-compose.yml ps
```

### Mode B: Full Orchestrator Stack Compose

Use when you need MongoDB + Redis + Prometheus + Grafana + Alertmanager:

```bash
docker compose -f orchestrator/docker-compose.yml config --services
docker compose -f orchestrator/docker-compose.yml up -d --build
docker compose -f orchestrator/docker-compose.yml ps
```

Do not run both modes simultaneously on the same host without port planning.

## Pre-Deployment Checklist

- [ ] `npm --prefix orchestrator run build`
- [ ] `npm --prefix orchestrator run test:integration`
- [ ] `bash scripts/check-doc-drift.sh`
- [ ] `jq . orchestrator_config.json >/dev/null`
- [ ] Required env vars prepared for selected mode:
  - `API_KEY`
  - `WEBHOOK_SECRET`
  - `MONGO_USERNAME`
  - `MONGO_PASSWORD`
  - `REDIS_PASSWORD`

## Post-Deployment Verification

- [ ] API health:
  ```bash
  curl -fsS http://localhost:3000/health
  ```
- [ ] State file exists at config path:
  ```bash
  test -f "$STATE_FILE" && echo "state file present"
  ```
- [ ] Last task entry readable:
  ```bash
  jq '.taskHistory[-1]' "$STATE_FILE"
  ```
- [ ] Logs directory exists:
  ```bash
  test -d "$LOGS_DIR" && ls -la "$LOGS_DIR" | head
  ```

## systemd (Optional/Legacy Path)

Use only when explicitly approved by your operations boundary.

- Unit examples are in `systemd/`.
- Keep `WorkingDirectory` and file paths consistent with your deployed checkout.
- Prefer `journalctl -u orchestrator -f` for first-line diagnostics.

## Safe Rollback Plan

If deployment fails:

1. Stop service/stack:
   ```bash
   docker compose -f orchestrator/docker-compose.yml down
   # or for root mode:
   # docker compose -f docker-compose.yml down
   ```
2. Checkout a known-good tag or commit (non-destructive):
   ```bash
   git fetch --tags
   git checkout <known-good-tag-or-sha>
   ```
3. Restore state from backup to configured state path:
   ```bash
   cp /backup/orchestrator-state-latest.json "$STATE_FILE"
   ```
4. Rebuild and start selected mode again.
5. Re-run post-deploy verification checks.

## Operational Notes

- Use [RUNBOOK_BOUNDARIES.md](../../operations/RUNBOOK_BOUNDARIES.md) to keep mode decisions consistent.
- Use [backup-recovery.md](./backup-recovery.md) for state/config backup policy.
- If docs and code conflict, code/config is canonical and docs must be updated in the same change set.

