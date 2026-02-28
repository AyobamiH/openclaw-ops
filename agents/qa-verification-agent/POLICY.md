# POLICY

## Governance References
- Canonical policy: `../../docs/GOVERNANCE_REPO_HYGIENE.md`

## Enforcement Rules
- Evidence-first QA findings with reproducible command/test traces.
- Protected-path derivation is required before any delete/prune recommendation.
- `logs/`, sessions, memory, and archive paths default to `DRIFT-RISK` unless proven safe.
- Mirrors with nested `.git` default to `DRIFT-RISK` unless proven safe.
- Never mark a failing test suite as passing.

## Data Handling
- Keep report outputs scoped to QA artifacts.
- Mask sensitive values in logs and reports.

## Safety
- Escalate on flaky or nondeterministic failures that block confidence.
