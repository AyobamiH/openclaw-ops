# Deployment Guide

## Quick Start (systemd)

### Prerequisites
- Node.js 22.x installed
- systemd available (Linux systems)

### Installation

1. **Build the orchestrator:**
```bash
cd orchestrator
npm install
npm run build
```

2. **Install systemd service:**
```bash
sudo cp systemd/orchestrator.service /etc/systemd/system/
sudo systemctl daemon-reload
```

3. **Start the service:**
```bash
sudo systemctl start orchestrator
sudo systemctl enable orchestrator  # Enable on boot
```

4. **Monitor:**
```bash
# Check status
sudo systemctl status orchestrator

# View logs
sudo journalctl -u orchestrator -f

# Check if running
sudo systemctl is-active orchestrator
```

---

## Docker Deployment

### Build Docker Image

```bash
docker build -t openclaw-orchestrator:latest .
```

### Run with Docker

```bash
docker run -d \
  --name orchestrator \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/orchestrator_config.json:/app/orchestrator_config.json:ro \
  -v $(pwd)/openclaw-docs:/app/openclaw-docs:ro \
  -v $(pwd)/openai-cookbook:/app/openai-cookbook:ro \
  openclaw-orchestrator:latest
```

### Run with Docker Compose

```bash
docker-compose up -d
docker-compose logs -f orchestrator
```

---

## systemd Service Management

### Common Commands

```bash
# Start
sudo systemctl start orchestrator

# Stop
sudo systemctl stop orchestrator

# Restart
sudo systemctl restart orchestrator

# Reload (for config changes)
sudo systemctl reload orchestrator

# Check status
sudo systemctl status orchestrator

# View recent logs
sudo systemctl status orchestrator -n 50

# Enable/disable on boot
sudo systemctl enable orchestrator
sudo systemctl disable orchestrator
```

### Logs

```bash
# Real-time logs
sudo journalctl -u orchestrator -f

# Last 50 lines
sudo journalctl -u orchestrator -n 50

# Since boot
sudo journalctl -u orchestrator --since boot

# Time range
sudo journalctl -u orchestrator --since "2 hours ago"
```

---

## Configuration

### Environment Variables

Edit `/etc/systemd/system/orchestrator.service`:

```ini
[Service]
Environment="LOG_LEVEL=debug"
Environment="ALERTS_ENABLED=true"
Environment="SLACK_ERROR_WEBHOOK=https://hooks.slack.com/..."
```

Then reload:
```bash
sudo systemctl daemon-reload
sudo systemctl restart orchestrator
```

### Config Files

- **orchestrator_config.json** - Main configuration
  - docsPath: Path to OpenClaw documentation
  - cookbookPath: Path to OpenAI cookbook
  - knowledgePackDir: Where to save knowledge packs

- **rss_filter_config.json** - RSS feed configuration and scoring weights

- **orchestrator_state.json** - Runtime state (auto-generated)

---

## Health Checks

### systemd Health

```bash
# Is service running?
sudo systemctl is-active orchestrator

# Check for restarts
sudo systemctl status orchestrator | grep "Restart"
```

### File-based Health

The orchestrator creates `orchestrator_state.json` with:
- `lastTask`: Last completed task timestamp
- `alerts`: Any recent alerts
- `taskQueue`: Pending tasks

```bash
cat orchestrator_state.json | jq '.lastTask'
```

### Manual Test

```bash
# Check if knowledge pack exists
ls -lh logs/knowledge-packs/

# Check if digests are being created
ls -lh logs/digests/ | tail -5

# Check recent activity
tail -20 logs/orchestrator.log 2>/dev/null || echo "No log file yet"
```

---

## Troubleshooting

### Service won't start

1. **Check syntax:**
```bash
systemd-analyze verify /etc/systemd/system/orchestrator.service
```

2. **Check permissions:**
```bash
ls -la /home/oneclickwebsitedesignfactory/.openclaw/workspace/orchestrator/dist/
```

3. **Check Node.js path:**
```bash
which node
node -v
```

4. **Check logs:**
```bash
sudo journalctl -u orchestrator -n 100 --no-pager
```

### High memory usage

Check `systemd/orchestrator.service` memory limits:
```ini
MemoryLimit=1G
```

Increase or remove if needed, then:
```bash
sudo systemctl daemon-reload
sudo systemctl restart orchestrator
```

### Task failures

1. Check alert logs in `orchestrator_state.json`
2. View full logs: `sudo journalctl -u orchestrator -f`
3. Validate config: `cat orchestrator_config.json | jq`

---

## Production Checklist

- [ ] systemd service file installed
- [ ] Knowledge packs generated: `logs/knowledge-packs/`
- [ ] Configuration files present: orchestrator_config.json, rss_filter_config.json
- [ ] Logs directory writable: `logs/`
- [ ] Documentation paths exist: openclaw-docs/, openai-cookbook/
- [ ] Service starts cleanly: `systemctl start orchestrator`
- [ ] Service auto-restarts: `systemctl is-active orchestrator`
- [ ] Logs are being written: `journalctl -u orchestrator | head`
- [ ] Tasks running on schedule: check orchestrator_state.json

---

## CI/CD Integration

GitHub Actions workflows automatically:
- **test.yml**: Builds and validates on PR
- **deploy.yml**: Creates deployment artifact on merge to main

To enable:
1. Push `.github/workflows/` to repository
2. GitHub Actions will run automatically on PRs and merges
3. Deployment artifacts available in Actions tab

---

## Monitoring & Alerts

The orchestrator includes built-in alerting:

1. **Error accumulation**: Task failures tracked across retries
2. **Critical alerts**: After 3 consecutive failures
3. **Email notifications**: Optional via environment variables
4. **Slack integration**: Optional webhook (see ERROR_ALERTS.md)

Configure alerts in `.service` file:
```ini
Environment="ALERTS_ENABLED=true"
Environment="ALERT_EMAIL_TO=ops@example.com"
```
