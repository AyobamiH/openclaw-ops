---
title: "Quick Start"
summary: "Minimal checklist to get running."
---

# Quick Start Checklist

```bash
# 1. Navigate
cd ~/.openclaw/workspace

# 2. Install orchestrator dependencies
cd orchestrator
npm install

# 3. Build
npm run build

# 4. Start
npm start

# (in another terminal)

# 5. Verify it's running
cd ..
tail -f logs/orchestrator.log

# 6. Check heartbeat (should see every ~5 minutes)
grep heartbeat logs/orchestrator.log

# 7. Sync docs (optional but recommended)
./sync_openclaw_docs.sh

# 8. Run a test task
./run_drift_validation.sh

# 9. View the result
cat logs/orchestrator.state.json | jq '.driftRepairs[-1]'
```

Done. System is running.

## Protected Path Derivation Rules

Before any repo cleanup or junk classification, apply the protected-path policy in `docs/GOVERNANCE_REPO_HYGIENE.md`.

At minimum, derive protection from:
- `orchestrator_config.json` path roots,
- agent `agent.config.json` path IO,
- systemd/cron/workflow/manual trigger evidence,
- sync scripts + orchestrator indexing and downstream consumption.

**Next:** Read [Getting Started](./getting-started.md) or [Architecture Overview](./architecture-overview.md).
