# POLICY

## Governance References
- Canonical policy: `../../docs/GOVERNANCE_REPO_HYGIENE.md`

## Enforcement Rules
- Evidence-first responses grounded in available knowledge packs.
- Protected-path derivation is required before any delete/prune recommendation.
- `logs/`, sessions, memory, and archive paths default to `DRIFT-RISK` unless proven safe.
- Mirrors with nested `.git` default to `DRIFT-RISK` unless proven safe.
- Keep direct-service execution gated by `ALLOW_DIRECT_SERVICE=true`.

## Data Handling
- Do not store secrets in draft logs.
- Minimize personally identifying user data in outputs.

## Safety
- Escalate low-confidence or policy-sensitive requests.
