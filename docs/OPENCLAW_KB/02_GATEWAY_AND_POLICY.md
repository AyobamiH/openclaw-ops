# Gateway, Auth, and Policy Enforcement

Last updated: 2026-02-24

## Verified Request Guard Layers

1. Content-length cap middleware (`1MB`) before JSON parsing.
2. Request logging for security events on `>=400` responses.
3. Route-level rate limiting (`webhookLimiter`, `apiLimiter`, `exportLimiter`, `authLimiter`, `healthLimiter`).
4. Authentication:
   - Bearer token for protected API endpoints
   - HMAC signature for webhook endpoint
5. Zod schema validation by body/query source.

## Verified Protection Matrix

| Endpoint | Auth | Validation | Rate Limit |
|---|---|---|---|
| `/health` | Public | None | healthLimiter |
| `/api/knowledge/summary` | Public | None | apiLimiter |
| `/api/persistence/health` | Public | None | healthLimiter |
| `/api/tasks/trigger` | Bearer | TaskTriggerSchema | apiLimiter + authLimiter |
| `/webhook/alerts` | HMAC | AlertManagerWebhookSchema | webhookLimiter + authLimiter |
| `/api/knowledge/query` | Bearer | KBQuerySchema | apiLimiter + authLimiter |
| `/api/knowledge/export` | Bearer | query format parsing | exportLimiter + authLimiter |
| `/api/persistence/historical` | Bearer | PersistenceHistoricalSchema | apiLimiter + authLimiter |
| `/api/persistence/export` | Bearer | None | exportLimiter + authLimiter |

## Policy Drift Risks

- Static token compare (single API key) with no key rotation framework in code.
- Query validation regex for KB query is strict ASCII-only; may reject valid multilingual input.
- Signature verification uses `JSON.stringify(req.body)`; signing behavior depends on upstream body canonicalization.

## Governance Position

- **Verified good**: strong baseline middleware stack.
- **Needs policy formalization**: key rotation cadence, webhook canonicalization contract, endpoint ownership review cadence.
