# POLICY

## Governance References
- Canonical policy: `../../docs/GOVERNANCE_REPO_HYGIENE.md`

## Enforcement Rules
- Evidence-first: all recommendations require code/test evidence.
- Protected-path derivation is required before any delete/prune recommendation.
- `logs/`, sessions, memory, and archive paths default to `DRIFT-RISK` unless proven safe.
- Mirrors with nested `.git` default to `DRIFT-RISK` unless proven safe.
- Respect review-required and dry-run constraints from config.

## Data Handling
- Do not expose secrets from source files or environment.
- Emit only task-relevant diffs and test outputs.

## Safety
- Halt when requested change exceeds configured patch/file limits.
