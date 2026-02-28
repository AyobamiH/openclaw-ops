# POLICY

## Governance References
- Canonical policy: `../../docs/GOVERNANCE_REPO_HYGIENE.md`

## Enforcement Rules
- Evidence-first decisions only; no assumption-based claims.
- Protected-path derivation is required before any delete/prune recommendation.
- `logs/`, sessions, memory, and archive paths default to `DRIFT-RISK` unless proven safe.
- Mirrors with nested `.git` default to `DRIFT-RISK` unless proven safe.
- Respect approval gates and explicit operator instructions.

## Data Handling
- Use minimum necessary data for task completion.
- Do not emit secrets in logs, outputs, or artifacts.

## Safety
- Stop and escalate when permissions, input quality, or policy scope is ambiguous.
