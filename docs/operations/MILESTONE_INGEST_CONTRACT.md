# Milestone Ingest Contract (Draft)

Status: Scaffolding only (not activated in runtime routes yet)  
Last updated: 2026-02-27

## Purpose

Define the canonical payload contract for delivering internal milestone events into `openclawdbot`.

## Endpoints

1. `POST /internal/milestones/ingest`
2. `GET /api/milestones/latest`

## Request Headers (Ingest)

- `x-openclaw-signature`: HMAC signature over canonical payload.
- `x-openclaw-timestamp`: UTC timestamp for replay-window enforcement.

## Request Body (Ingest)

```json
{
  "idempotencyKey": "string",
  "sentAtUtc": "2026-02-27T12:34:56.000Z",
  "event": {
    "milestoneId": "string",
    "timestampUtc": "2026-02-27T12:34:56.000Z",
    "scope": "string",
    "claim": "string",
    "evidence": [
      {
        "type": "doc",
        "path": "docs/CLAWDBOT_MILESTONES.md",
        "summary": "Milestone spec updated",
        "ref": "optional"
      }
    ],
    "riskStatus": "on-track",
    "nextAction": "string",
    "source": "orchestrator"
  }
}
```

## Response Body (Ingest)

Success accepted:

```json
{ "ok": true, "status": "accepted", "milestoneId": "..." }
```

Success duplicate:

```json
{ "ok": true, "status": "duplicate", "milestoneId": "..." }
```

Rejected:

```json
{ "ok": false, "status": "rejected", "reason": "..." }
```

## Feed Endpoint Response

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

## Source Files (Scaffolding)

- `orchestrator/src/milestones/schema.ts` (Zod schema + inferred types)
- `openclawdbot/src/shared/milestones.ts` (shared app-facing types)
- `openclawdbot/src/server/contracts/milestones.ts` (endpoint path/types)

## Activation Boundary

No route handlers or workers are wired in this draft. This contract is a non-runtime scaffold to unblock Sprint B implementation and tests.

