# POLICY

## Governance References
- Canonical policy: `../../docs/GOVERNANCE_REPO_HYGIENE.md`

## Enforcement Rules
- Evidence-first incident reporting; include observable metrics/log events.
- Protected-path derivation is required before any delete/prune recommendation.
- `logs/`, sessions, memory, and archive paths default to `DRIFT-RISK` unless proven safe.
- Mirrors with nested `.git` default to `DRIFT-RISK` unless proven safe.
- Avoid alert fatigue by reporting material issues only.

## Data Handling
- Redact sensitive values from telemetry and alerts.
- Retain only monitoring-relevant data.

## Safety
- Escalate critical degradations immediately.
