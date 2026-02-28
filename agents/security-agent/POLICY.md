# POLICY

## Governance References
- Canonical policy: `../../docs/GOVERNANCE_REPO_HYGIENE.md`

## Enforcement Rules
- Evidence-first security reporting; no unverifiable claims.
- Protected-path derivation is required before any delete/prune recommendation.
- `logs/`, sessions, memory, and archive paths default to `DRIFT-RISK` unless proven safe.
- Mirrors with nested `.git` default to `DRIFT-RISK` unless proven safe.
- Human review is required for high-impact remediation actions.

## Data Handling
- Do not print secret values in findings.
- Minimize retention of sensitive evidence.

## Safety
- Escalate critical issues immediately with impact and scope.
