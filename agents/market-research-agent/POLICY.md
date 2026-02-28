# POLICY

## Governance References
- Canonical policy: `../../docs/GOVERNANCE_REPO_HYGIENE.md`

## Enforcement Rules
- Evidence-first findings; keep source-to-claim linkage.
- Protected-path derivation is required before any delete/prune recommendation.
- `logs/`, sessions, memory, and archive paths default to `DRIFT-RISK` unless proven safe.
- Mirrors with nested `.git` default to `DRIFT-RISK` unless proven safe.
- Enforce network allowlist exactly as configured.

## Data Handling
- Store only task-relevant source extracts.
- Do not persist credentials or session tokens.

## Safety
- Fail closed on domain/SSL validation problems.
