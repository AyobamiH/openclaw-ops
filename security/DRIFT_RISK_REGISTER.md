# Drift Risk Register

| ID | Drift Risk | Current Signal | Severity | Action |
|---|---|---|---|---|
| DR-001 | Config says task exists but runtime doesn’t route it | `orchestratorTask` values without handlers/schemas | High | Add CI mapping guard + fail build |
| DR-002 | Claimed ToolGate exists but runtime missing | `skills/index.ts` references absent module | Critical | Implement module + startup assertion |
| DR-003 | Claimed skill audit exists but module missing | dynamic import to non-existent `skillAudit.js` | Critical | Implement audit module or remove claim + gate |
| DR-004 | Orchestrator-only policy bypassed by standalone services | systemd `doc-specialist` and `reddit-helper` units | High | disable or route through orchestrator tasks |
| DR-005 | Unknown task fallback hides invalid requests | fallback returns message not hard error | Medium | reject + alert + metric |
| DR-006 | Deploy mode mismatch | root compose vs orchestrator compose divergence | Medium | standardize deployment baseline |

## Review Cadence

- Daily: DR-001, DR-002, DR-003
- Weekly: DR-004, DR-006
- Monthly: full control-plane regression review
