# QA & Verification Matrix

Last updated: 2026-02-24

| Domain | Verification | Evidence Source | Status |
|---|---|---|---|
| Routing enforcement | Unknown task rejected at API + queue | `validation.ts`, `taskQueue.ts`, `taskHandlers.ts` | Pass |
| Control-plane exclusivity | No execution outside orchestrator | `systemd/*.service` | Fail |
| Policy compliance | Role/file/network constraints runtime-enforced | `agent.config.json`, `taskHandlers.ts`, `toolGate.ts` | Partial |
| Skill safety | Mandatory gateway on all skill/tool calls | `toolGate.ts`, spawn paths | Partial |
| Approval gating | Destructive actions hard-stop without approval | configs + handlers | Partial |
| Audit chain integrity | All state mutations tamper-evident | `state.ts`, logs | Partial |
| Mission lifecycle integrity | Bounded chain depth/termination | `index.ts`, handlers | Partial |
| Workspace isolation | No cross-workspace mutation | config + filesystem paths | Partial |
| Credential boundaries | Least-privileged env exposure | spawn env handling | Fail |
| Webhook safety | Canonical HMAC verification | `auth.ts`, integration tests | Pass |

## Release Gate Recommendation
- Block production safe-autonomy claims until all `Fail` become `Pass` and all `Partial` have explicit compensating controls and tests.
