# Live 3000 Dispatch Runbook

Last updated: 2026-02-26

## Purpose

Run the exact live orchestrator dispatch validation at 3000 tasks via `POST /api/tasks/trigger` with reproducible settings and durable summary output.

## One-command execution

From `workspace/orchestrator`:

```bash
npm run test:live:3000
```

This command:

- boots orchestrator in fast-start mode,
- dispatches 3000 heartbeat tasks through authenticated HTTP ingress,
- verifies completions from orchestrator stdout correlation,
- appends one JSON summary line to `logs/live-dispatch-runs.jsonl`.

## Output contract

Console output includes:

- accepted/throttled/unauthorized counts,
- enqueue latency p50/p95/max,
- effective dispatch rate,
- completion coverage and drain time.

Persistent run summary record is appended to:

- `logs/live-dispatch-runs.jsonl`

Each line is a standalone JSON object (append-only).

## Config knobs

Optional environment variables:

- `LIVE_RATE_TOTAL_TASKS` (default `3000`)
- `LIVE_RATE_INTERVAL_MS` (default `25`)
- `LIVE_RATE_IP_POOL` (default `400`)
- `LIVE_RATE_RUN_LOG` (default `<logsDir>/live-dispatch-runs.jsonl`)
- `ORCHESTRATOR_FAST_START` (default `true` for this runbook)

## Quick sanity run

```bash
npm run test:live:quick
```

Use this for fast smoke validation before running the full 3000-task pass.