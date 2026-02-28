# Invariant Matrix

| Invariant | Status | Evidence | Owner | Priority |
|---|---|---|---|---|
| Protected endpoints require auth | PASS (partial surface) | `index.ts` middleware chains | Orchestrator | P1 |
| Unknown tasks rejected | FAIL | `taskHandlers.ts` fallback returns message | Orchestrator | P0 |
| Agent task declarations fully wired | FAIL | Unmapped: market/data-extraction/qa-verification | Orchestrator | P0 |
| Central skill gate present | FAIL | missing `toolGate` runtime module | Platform | P0 |
| Startup skill audit gate present | FAIL | missing `orchestrator/src/skillAudit.ts` | Platform | P0 |
| Single dispatch authority enforced | FAIL | standalone systemd services for agents | Operations | P1 |
| State mutation bounded | PASS (with caveats) | `state.ts` truncation limits | Orchestrator | P2 |
| Persistence outage visibility | PARTIAL | init soft-fail but no required persistent alert loop | Platform | P1 |
