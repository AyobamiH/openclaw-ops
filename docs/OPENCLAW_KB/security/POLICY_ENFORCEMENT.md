# Security Policy Enforcement

Last updated: 2026-02-24

## Enforced Today
- Bearer auth on protected APIs
- HMAC webhook signature verification
- Request schema validation and content-size restrictions
- Task allowlist at queue ingress

## Not Fully Enforced Yet
- Runtime enforcement of all declared agent file/network/secret boundaries
- Universal skill/tool policy gateway for every execution path
- Approval hard-stop for all destructive actions

## Priority Fixes
1. Mandatory policy engine before all spawn/tool actions.
2. Environment filtering for child processes (deny secret inheritance by default).
3. Signed audit records for state-changing operations.
