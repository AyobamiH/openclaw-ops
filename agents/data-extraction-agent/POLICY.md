# POLICY

## Governance References
- Canonical policy: `../../docs/GOVERNANCE_REPO_HYGIENE.md`

## Enforcement Rules
- Evidence-first extraction: keep source-to-output traceability.
- Protected-path derivation is required before any delete/prune recommendation.
- `logs/`, sessions, memory, and archive paths default to `DRIFT-RISK` unless proven safe.
- Mirrors with nested `.git` default to `DRIFT-RISK` unless proven safe.
- Respect declared read/write path boundaries.

## Data Handling
- Extract only task-required fields.
- Avoid emitting raw sensitive text unless explicitly required.

## Safety
- Stop and report when file size/format exceeds configured constraints.
