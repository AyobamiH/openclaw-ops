# POLICY

## Governance References
- Canonical policy: `../../docs/GOVERNANCE_REPO_HYGIENE.md`

## Enforcement Rules
- Evidence-first summaries; preserve source-grounded claims.
- Protected-path derivation is required before any delete/prune recommendation.
- `logs/`, sessions, memory, and archive paths default to `DRIFT-RISK` unless proven safe.
- Mirrors with nested `.git` default to `DRIFT-RISK` unless proven safe.
- Do not suppress uncertainty when source evidence is weak.

## Data Handling
- Minimize retention of raw long-form content.
- Avoid surfacing sensitive raw text unnecessarily.

## Safety
- Escalate when requested summary would misrepresent source intent.
