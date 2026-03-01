# Milestone Pipeline Runbook

**Scope:** OpenClaw orchestrator → openclawdbot milestone + demand delivery  
**Audience:** On-call operator / maintainer  
**Last updated:** 2026-02-28

---

## 1. Architecture overview

```
Orchestrator (Docker)                  openclawdbot (Devvit/Reddit)
──────────────────────                 ───────────────────────────────
MilestoneEmitter.emit()
  └─ validates (Zod)
  └─ appends to logs/milestones.jsonl
  └─ queues MilestoneDeliveryRecord (state.milestoneDeliveries)
  └─ deliverPending() ──HMAC-signed POST──▶ /internal/milestones/ingest
                                               └─ verifies signature
                                               └─ Redis idempotency (milestone:seen:<key>)
                                               └─ appends to milestones:feed (max 50)
                                               └─ realtime.send() → live client updates
                                               └─ on rejection: milestones:rejected (max 100)

DemandSummaryEmitter.emit()
  └─ builds structured queue/draft snapshot
  └─ queues DemandSummaryDeliveryRecord (state.demandSummaryDeliveries)
  └─ deliverPending() ──HMAC-signed POST──▶ /internal/demand/ingest
                                               └─ verifies signature
                                               └─ Redis idempotency (demand:summary:seen:<key>)
                                               └─ stores latest demand snapshot
                                               └─ realtime.send() → demand UI refresh
                                               └─ on rejection: demand:summary:rejected (max 100)

GET /api/milestones/latest             ← Proof timeline
GET /api/milestones/dead-letter        ← operator visibility
GET /api/command-center/demand-live    ← raw latest demand snapshot
GET /api/command-center/demand         ← composed Demand view payload
```

**Delivery retry logic:** `pending` → 3× attempts → `dead-letter` (5xx/network errors).  
4xx responses (bad signature, invalid JSON) skip retries and go straight to `rejected`.

---

## 2. Initial setup

### 2a. Set the ingest URL

After deploying openclawdbot, update `orchestrator_config.json`:

```json
{
  "milestoneIngestUrl": "https://<your-devvit-app-hostname>/internal/milestones/ingest",
  "demandSummaryIngestUrl": "https://<your-devvit-app-hostname>/internal/demand/ingest"
}
```

Restart the orchestrator after editing.

### 2b. Set the signing secret

**Orchestrator side** — in `orchestrator/.env`:

```
MILESTONE_SIGNING_SECRET=<256-bit hex secret>
```

Generate a new secret:

```bash
node -e "require('crypto').randomBytes(32).toString('hex')"
```

**openclawdbot side** — store the same value in the app via the milestone
secret form or the form submit route:

- Reddit app menu: `Configure Milestone Pipeline Secret`
- Internal form submit route: `POST /internal/forms/milestone-secret-submit`

The app stores this value in Redis under the app-scoped key
`milestones:signing-secret`.

Both values **must be identical**. The same secret is reused for:

- `POST /internal/milestones/ingest`
- `POST /internal/demand/ingest`

---

## 3. Backfilling historical events

Run once after initial setup to push historical startup events into the feed:

```bash
# Inside the Docker container
docker exec -it <orchestrator-container> npm run milestones:backfill

# Or locally (if you have write access to the state file)
STATE_FILE=/path/to/orchestrator-state.json npm run milestones:backfill
```

The script is idempotent — re-running it skips already-queued milestone IDs.

Expected output when all records are delivered:

```
[backfill] emit   orchestrator.started.2026-02-26T06:06:48.768Z
[backfill] 3 new milestone(s) emitted, 0 skipped
[backfill] delivering to https://... ...
[backfill] delivery done — 3 delivered, 0 failed
```

---

## 4. Verifying end-to-end delivery

### Check the feed is populated

```bash
curl https://<your-devvit-app-hostname>/api/milestones/latest?limit=5
```

Expected shape:

```json
{
  "ok": true,
  "items": [
    {
      "milestoneId": "orchestrator.started.2026-02-26T06:06:48.768Z",
      "scope": "runtime",
      "claim": "Orchestrator started successfully.",
      "riskStatus": "on-track",
      ...
    }
  ]
}
```

### Check the dead-letter queue

```bash
curl https://<your-devvit-app-hostname>/api/milestones/dead-letter
```

`count: 0` is healthy. Non-zero means deliveries are being rejected — see Section 6.

### Check the latest live demand snapshot

```bash
curl https://<your-devvit-app-hostname>/api/command-center/demand-live
```

Healthy shape:

```json
{
  "ok": true,
  "snapshot": {
    "summaryId": "demand.summary....",
    "queueTotal": 3,
    "draftTotal": 3,
    "selectedForDraftTotal": 1,
    "topPillars": [{ "id": "openclaw", "label": "Openclaw", "count": 2 }],
    "segments": []
  },
  "stale": false
}
```

The composed UI route should also respond:

```bash
curl https://<your-devvit-app-hostname>/api/command-center/demand
```

---

## 5. Rotating the signing secret

**Both sides must be updated atomically.** A window where secrets differ will cause delivery rejections and populate the dead-letter queue.

1. Generate a new secret:

   ```bash
   node -e "require('crypto').randomBytes(32).toString('hex')"
   ```

2. Stop the orchestrator:

   ```bash
   docker stop <orchestrator-container>
   ```

3. Update `orchestrator/.env`:

   ```
   MILESTONE_SIGNING_SECRET=<new-value>
   ```

4. Update the app-side secret via the milestone secret form (or
   `POST /internal/forms/milestone-secret-submit`) using the same new value.

5. Restart the orchestrator:

   ```bash
   docker start <orchestrator-container>
   ```

6. Verify: `GET /api/milestones/dead-letter` should remain at `count: 0`.

---

## 6. Diagnosing delivery failures

### Symptom: dead-letter queue is growing

```bash
curl https://<your-devvit-app-hostname>/api/milestones/dead-letter
```

| Reason in response                                       | Cause                                  | Fix                                              |
| -------------------------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| `invalid signature`                                      | Secret mismatch                        | Re-run Section 5 rotation                        |
| `server misconfigured: MILESTONE_SIGNING_SECRET not set` | Devvit secret not set                  | Run `devvit settings set milestoneSigningSecret` |
| `missing x-openclaw-signature`                           | Orchestrator sending unsigned requests | Verify `MILESTONE_SIGNING_SECRET` is in `.env`   |
| `invalid JSON body`                                      | Corrupted envelope                     | Check orchestrator logs for serialization errors |

### Symptom: records stuck as `retrying` in orchestrator state

The 5-minute delivery poller in `index.ts` will retry them automatically. If the orchestrator is down, run manually:

```bash
docker exec -it <orchestrator-container> npm run milestones:backfill
```

### Symptom: `dead-letter` records in orchestrator state

These will NOT be retried automatically. To re-queue them, reset their status in the state file:

```bash
# Find dead-letter records
docker exec -it <orchestrator-container> node -e "
const s = JSON.parse(require('fs').readFileSync('/app/data/orchestrator-state.json'));
const dl = s.milestoneDeliveries.filter(r => r.status === 'dead-letter');
console.log(dl.length + ' dead-letter records:', dl.map(r => r.milestoneId));
"

# Reset to pending (edit orchestrator-state.json directly, then restart)
```

---

## 7. Log locations

| What                                  | Where                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------- |
| Milestone append log                  | `orchestrator/logs/milestones.jsonl`                                      |
| Orchestrator state (delivery records) | `/app/data/orchestrator-state.json` → `milestoneDeliveries[]`             |
| Orchestrator demand delivery state    | `/app/data/orchestrator-state.json` → `demandSummaryDeliveries[]`         |
| Ingest rejections (server-side)       | Redis key `milestones:rejected` (via `/api/milestones/dead-letter`)       |
| Live feed                             | Redis key `milestones:feed` (via `/api/milestones/latest`)                |
| Demand ingest rejections              | Redis key `demand:summary:rejected`                                       |
| Latest demand snapshot                | Redis key `demand:summary:latest` (via `/api/command-center/demand-live`) |

---

## 8. Related documents

- `docs/operations/MILESTONE_INGEST_CONTRACT.md` — signing protocol and envelope schema
- `docs/operations/clawdbot-milestone-delivery-plan.md` — delivery plan and acceptance criteria
- `docs/CLAWDBOT_MILESTONES.md` — milestone field definitions
- `orchestrator/src/milestones/emitter.ts` — emitter source
- `orchestrator/src/demand/emitter.ts` — demand summary emitter source
- `openclawdbot/src/server/routes/milestones.ts` — ingest/feed/dead-letter routes
- `openclawdbot/src/server/routes/demand.ts` — demand ingest + demand-live routes
- `orchestrator/test/milestones.e2e.test.ts` — end-to-end test suite
