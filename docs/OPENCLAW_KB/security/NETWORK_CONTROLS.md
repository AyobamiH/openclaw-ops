# Network Controls

Last updated: 2026-02-24

## Present Controls
- API ingress rate limits and auth controls.
- Webhook ingress signature validation.
- Agent configs declare allowed domains.

## Enforcement Gap
- Declared outbound domain allowlists are not proven universally enforced at runtime for all spawned processes.

## Governance Requirement
- Add central egress policy proxy/firewall for agent runtime.
- Deny outbound requests that are not declared and approved.
