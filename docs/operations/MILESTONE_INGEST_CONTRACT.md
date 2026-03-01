# Milestone Ingest Contract

Status: Active runtime contract
Last updated: 2026-02-28

## Purpose

Define the live contract used to deliver milestone events from the orchestrator
into `openclawdbot`.

Demand telemetry now uses a parallel signed summary channel. Milestones remain
the narrative proof contract; demand summaries are a separate structured
contract that reuse the same HMAC header model and signing secret path by
default.

## Active Endpoints

1. `POST /internal/milestones/ingest`
2. `GET /api/milestones/latest`
3. `GET /api/milestones/dead-letter`

## Request Headers

- `x-openclaw-signature`: HMAC-SHA256 signature over the canonical payload
- `x-openclaw-timestamp`: UTC timestamp attached by the sender

## Request Body

```json
{
  "idempotencyKey": "string",
  "sentAtUtc": "2026-02-28T12:34:56.000Z",
  "event": {
    "milestoneId": "string",
    "timestampUtc": "2026-02-28T12:34:56.000Z",
    "scope": "string",
    "claim": "string",
    "evidence": [
      {
        "type": "log",
        "path": "workspace/orchestrator_state.json",
        "summary": "runtime evidence"
      }
    ],
    "riskStatus": "on-track",
    "nextAction": "string",
    "source": "orchestrator"
  }
}
```

## Ingest Responses

Accepted:

```json
{ "ok": true, "status": "accepted", "milestoneId": "..." }
```

Duplicate:

```json
{ "ok": true, "status": "duplicate", "milestoneId": "..." }
```

Rejected:

```json
{ "ok": false, "status": "rejected", "reason": "..." }
```

## Feed Response

```json
{
  "ok": true,
  "items": [
    {
      "milestoneId": "...",
      "timestampUtc": "...",
      "scope": "...",
      "claim": "...",
      "evidence": [],
      "riskStatus": "on-track",
      "nextAction": "...",
      "source": "orchestrator"
    }
  ]
}
```

## Current Runtime Guarantees

The active implementation provides:

- signature verification
- idempotency by `idempotencyKey`
- malformed event rejection
- bounded feed storage
- dead-letter visibility for rejected records

## Adjacent Signed Demand Channel

The app also exposes a parallel demand-summary path:

1. `POST /internal/demand/ingest`
2. `GET /api/command-center/demand-live`
3. `GET /api/command-center/demand`

That channel carries queue and draft telemetry for the Demand view. It is
intentionally separate from milestone events so the proof timeline does not get
flooded with structured operational counters.

## Source Files

- `orchestrator/src/milestones/schema.ts`
- `orchestrator/src/milestones/emitter.ts`
- `openclawdbot/src/shared/milestones.ts`
- `openclawdbot/src/server/routes/milestones.ts`
- `openclawdbot/src/shared/demand-summary.ts`
- `openclawdbot/src/server/routes/demand.ts`
