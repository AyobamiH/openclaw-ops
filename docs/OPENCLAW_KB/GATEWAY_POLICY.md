# Gateway & Policy Enforcement Audit

Last updated: 2026-02-24

## API Security Middleware (Verified)
- Bearer auth for protected endpoints: `requireBearerToken`
- Webhook HMAC verification for alert ingress: `verifyWebhookSignature`
- Request schema validation via zod middleware
- Rate limits (`webhookLimiter`, `apiLimiter`, `exportLimiter`, `authLimiter`)
- Content-length limit middleware

## Strengths
- Unknown task types are rejected at validation and queue boundaries.
- API keys support rotation checks at startup.
- Webhook signatures use canonicalized payload signing and timing-safe comparison.

## Gaps
- **High**: No universal network egress policy enforcement for all spawned agent processes.
- **High**: Filesystem path restrictions in agent configs are not uniformly enforced at execution time.
- **Medium**: Credentials boundary is mostly env/process-level convention; agent child processes inherit environment unless filtered.
- **Medium**: Direct tool invocation outside a mandatory gateway remains possible in code paths that spawn/process directly.

## Policy Bypass Candidates
1. Direct `spawn()` paths in task handlers can bypass intended skill gateway controls.
2. Standalone agent service invocation can diverge from orchestrator-mediated policy checks.
3. Mutable local state/artifacts can be altered by privileged local actors without orchestrator API path.

## Enforcement Maturity
- HTTP gateway controls: **Strong**
- Skill/tool runtime policy gateway: **Partial**
- Host-level execution isolation: **Weak to partial**
