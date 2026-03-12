# Gateway, Auth, and Policy Enforcement

Last updated: 2026-03-02

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

- Bearer token comparison is now constant-time, and key rotation metadata is
  enforced at startup. The remaining gap is operational rotation discipline, not
  absence of code support.
- Query validation regex for KB query is strict ASCII-only; may reject valid multilingual input.
- Signature verification uses recursively sorted canonical JSON, so drift risk
  now centers on caller contract alignment rather than raw `JSON.stringify`
  ordering.

## Governance Position

- **Verified good**: strong baseline middleware stack.
- **Partial runtime**: ToolGate and route-context protections now exist, but
  they are not a full universal governance boundary for every execution path.
- **Deferred / planned**: full manifest boundary enforcement, full skill audit
  wiring, and stronger sandboxing remain future governance work.
- **Needs policy formalization**: key rotation cadence, endpoint ownership
  review cadence, and continued clarity about which internal app routes are
  lifecycle-only versus interactive-user surfaces.
