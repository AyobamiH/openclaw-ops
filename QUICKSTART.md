# OpenClaw Orchestrator — Quick Start

## Two Deployment Paths

### Path A: Local Dev

```bash
cd workspace/orchestrator
npm install
npm run dev
```

Config: `workspace/orchestrator_config.json` (absolute paths, used by local + systemd)

**Systemd service**: `workspace/systemd/orchestrator.service`

---

### Path B: Docker Compose (full stack)

Brings up orchestrator + MongoDB + Redis + Prometheus.

```bash
cd workspace/orchestrator
cp .env.example .env   # if not already done
# fill in all required vars (see below)
docker-compose up -d
```

Config: `workspace/orchestrator/orchestrator_config.json` (uses `/app/*` container paths)

> A legacy workspace-level `workspace/docker-compose.yml` also exists but is not the primary path.

---

## Environment Variables

All vars live in `workspace/orchestrator/.env`.

| Variable | Required | Notes |
|---|---|---|
| `API_KEY` | ✅ | Security posture check — orchestrator refuses to start without it |
| `WEBHOOK_SECRET` | ✅ | Security posture check — orchestrator refuses to start without it |
| `MONGO_USERNAME` | ✅ (Docker) | MongoDB auth |
| `MONGO_PASSWORD` | ✅ (Docker) | MongoDB auth |
| `REDIS_PASSWORD` | ✅ (Docker) | Redis auth |
| `DATABASE_URL` | ✅ | Full MongoDB connection URL |
| `REDIS_URL` | ✅ | Full Redis connection URL |
| `OPENAI_API_KEY` | ✅ | LLM agents |
| `ANTHROPIC_API_KEY` | ✅ | LLM agents |
| `MILESTONE_SIGNING_SECRET` | ✅ | Must match openclawdbot server |
| `SLACK_ERROR_WEBHOOK` | Optional | Alert delivery to Slack |

---

## Verify Orchestrator Is Running

```bash
# Confirm process is up
ps aux | grep orchestrator

# Tail logs
tail -f workspace/orchestrator/logs/orchestrator.log

# Expected log lines on healthy start:
# [orchestrator] config loaded { ... }
# [orchestrator] Scheduled 3 cron jobs: nightly-batch (11pm), send-digest (6am), heartbeat (5min)
# [orchestrator] ✅ startup: orchestrator boot complete
```

---

## Scheduled Tasks (in-process)

| Schedule | Task | What |
|---|---|---|
| `0 23 * * *` (11pm UTC) | `nightly-batch` | Collect leads, mark high-confidence, create digest |
| `0 6 * * *` (6am UTC) | `send-digest` | Send digest notification |
| Every 5 min | `heartbeat` | Health check |

---

## Milestone Pipeline

```
Orchestrator
  → writes orchestrator/data/milestones-feed.json
  → host cron (*/2 * * * *) runs scripts/push-feed.sh → git push to GitHub
  → jsDelivr CDN serves the feed
  → openclawdbot Devvit scheduler polls every 60s → writes Reddit wiki
  → app UI reads wiki
```

Host cron entry:
```
*/2 * * * * /path/to/workspace/orchestrator/scripts/push-feed.sh
```

---

## openclawdbot (Reddit Devvit App)

Located at `workspace/openclawdbot/`.

> **Required for all `devvit` CLI calls:**
> ```bash
> export NODE_OPTIONS="--dns-result-order=ipv4first"
> ```

```bash
cd workspace/openclawdbot

# Deploy (type-check + lint + test + upload)
npm run deploy

# Deploy + publish
npm run launch
```

Deployed on **r/openclawdbot_dev**.

---

## Troubleshooting

**Orchestrator won't start** — missing `API_KEY` or `WEBHOOK_SECRET` in `.env`.

**Milestone feed not updating** — check host cron is running `push-feed.sh` and that `data/milestones-feed.json` is being written.

**Devvit deploy fails** — ensure `NODE_OPTIONS="--dns-result-order=ipv4first"` is exported first.

**Slack alerts not arriving** — verify `SLACK_ERROR_WEBHOOK` is set and test with:
```bash
curl -X POST "$SLACK_ERROR_WEBHOOK" -d '{"text":"test"}'
```

---

## Deployment Checklist

- [ ] `.env` created with all required vars
- [ ] `npm install` run in `workspace/orchestrator`
- [ ] Orchestrator starts and logs show `startup: orchestrator boot complete`
- [ ] `data/milestones-feed.json` is being written
- [ ] Host cron `push-feed.sh` is registered
- [ ] `NODE_OPTIONS` set before any `devvit` CLI calls
- [ ] `MILESTONE_SIGNING_SECRET` matches between orchestrator and openclawdbot
