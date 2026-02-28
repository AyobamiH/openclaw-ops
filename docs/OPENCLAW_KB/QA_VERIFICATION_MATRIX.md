# QA & Verification Matrix

Last reviewed: 2026-02-28

| Domain | Verification | Evidence Source | Status |
|---|---|---|---|
| Routing enforcement | Unknown task rejected at API + queue | `validation.ts`, `taskQueue.ts`, `taskHandlers.ts` | Pass |
| Control-plane exclusivity | Orchestrator-first routing is the only runtime path | `systemd/*.service`, `taskHandlers.ts` | Partial |
| Policy compliance | Role/file/network constraints runtime-enforced | `agent.config.json`, `taskHandlers.ts`, `toolGate.ts` | Partial |
| Skill safety | Mandatory gateway on direct skill calls and spawned-task preflight | `skills/index.ts`, `toolGate.ts`, `taskHandlers.ts` | Partial |
| Approval gating | Destructive actions hard-stop without approval | configs + handlers | Partial |
| Audit chain integrity | All state mutations tamper-evident | `state.ts`, logs | Partial |
| Mission lifecycle integrity | Bounded chain depth/termination | `index.ts`, handlers | Partial |
| Workspace isolation | No cross-workspace mutation | config + filesystem paths | Partial |
| Credential boundaries | Least-privileged env exposure | spawn env handling | Partial |
| Webhook safety | Canonical HMAC verification | `auth.ts`, integration tests | Pass |

## Release Gate Recommendation

- Treat `Pass` as current strengths.
- Treat `Partial` as the active hardening queue.
- Do not make fully closed safe-autonomy claims until the remaining `Partial`
  items have explicit compensating controls and tests.
