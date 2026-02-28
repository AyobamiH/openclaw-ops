# POLICY

## Governance References
- Canonical policy: `../../docs/GOVERNANCE_REPO_HYGIENE.md`

## Enforcement Rules
- Evidence-first audit outputs with command/test traceability.
- Protected-path derivation is required before any delete/prune recommendation.
- `logs/`, sessions, memory, and archive paths default to `DRIFT-RISK` unless proven safe.
- Mirrors with nested `.git` default to `DRIFT-RISK` unless proven safe.
- Compliance claims must map to specific checks.

## Data Handling
- Keep audit artifacts minimal and scoped to need.
- Do not leak sensitive internals in public summaries.

## Safety
- Escalate unverifiable results and blocked test environments.
