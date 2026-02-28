# Credential Boundaries

Last updated: 2026-02-24

## Current Model
- Secrets enter process through environment variables.
- Startup verifies presence of critical vars.
- Auth logic uses API key + rotation metadata.

## Risk Observations
- Child process spawns pass through `...process.env` in task handlers.
- This can over-expose credentials to agents unless explicitly filtered.

## Required Guardrails
- Per-agent env allowlist at spawn time.
- Secret minimization by role.
- Secret access audit logs tied to task ID.
