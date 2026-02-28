# POLICY

## Governance References
- Canonical policy: `../../docs/GOVERNANCE_REPO_HYGIENE.md`

## Enforcement Rules
- Evidence-first normalization; preserve traceability of transformations.
- Protected-path derivation is required before any delete/prune recommendation.
- `logs/`, sessions, memory, and archive paths default to `DRIFT-RISK` unless proven safe.
- Mirrors with nested `.git` default to `DRIFT-RISK` unless proven safe.
- Keep transformations deterministic when possible.

## Data Handling
- Preserve input provenance metadata when available.
- Do not leak sensitive source fragments unnecessarily.

## Safety
- Fail fast on schema ambiguity and report required clarifications.
