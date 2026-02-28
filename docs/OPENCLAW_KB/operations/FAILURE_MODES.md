# Failure Modes

Last updated: 2026-02-24

## Known Failure Classes
- Invalid/missing auth credentials at startup (hard fail)
- Invalid task type ingestion (rejected)
- External dependency failure (Mongo/metrics/alerts) with mixed fail-open behavior
- Spawned agent non-zero exit
- Signature/auth failures on ingress

## Governance-Relevant Failure Risks
- Policy drift from direct service execution.
- State file tampering outside orchestrator pathway.
- Partial subsystem startup causing implicit degraded mode.

## Contract Reference
- Spawned-agent failure/success interpretation is defined in `docs/OPENCLAW_KB/operations/AGENT_EXECUTION_CONTRACT.md` (hard cutover; no backward compatibility).

## Severity
- Critical: routing/policy bypass through alternate execution paths.
- High: role/permission declarations not enforced uniformly.
- Medium: degraded mode not always reflected as governance status.
