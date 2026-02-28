# POLICY

## Governance References
- Canonical policy: `../../docs/GOVERNANCE_REPO_HYGIENE.md`

## Enforcement Rules
- Evidence-first writing only; cite source artifacts when making claims.
- Protected-path derivation is required before any delete/prune recommendation.
- `logs/`, sessions, memory, and archive paths default to `DRIFT-RISK` unless proven safe.
- Mirrors with nested `.git` default to `DRIFT-RISK` unless proven safe.
- Maintain factual accuracy over stylistic expansion.

## Data Handling
- No secret material in generated content.
- Avoid copying sensitive raw logs into published docs.

## Safety
- Mark unknowns explicitly instead of guessing.
