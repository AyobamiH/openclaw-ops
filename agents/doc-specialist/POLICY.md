# POLICY

## Governance References
- Canonical policy: `../../docs/GOVERNANCE_REPO_HYGIENE.md`

## Enforcement Rules
- Evidence-first pack generation with path-level provenance.
- Protected-path derivation is required before any delete/prune recommendation.
- `logs/`, sessions, memory, and archive paths default to `DRIFT-RISK` unless proven safe.
- Mirrors with nested `.git` default to `DRIFT-RISK` unless proven safe.
- Keep direct-service execution gated by `ALLOW_DIRECT_SERVICE=true`.

## Data Handling
- Avoid embedding unnecessary raw document content in metadata fields.
- Keep state updates minimal and deterministic.

## Safety
- Escalate when source mirrors or state files are missing/inconsistent.
