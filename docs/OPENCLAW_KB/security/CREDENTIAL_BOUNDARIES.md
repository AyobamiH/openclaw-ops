# Credential Boundaries

Last updated: 2026-03-02

## Current Model
- Secrets enter process through environment variables.
- Startup verifies presence of critical vars.
- Auth logic uses API key + rotation metadata.

## Risk Observations
- Child process spawns no longer pass through the full parent environment.
- A curated allowlist now limits inherited env variables, but selected provider
  credentials still flow to spawned agents by design, and there is still no
  host-level sandbox boundary.

## Required Guardrails
- Keep the per-agent env allowlist narrow and review it whenever a new child
  execution path is added.
- Continue reducing credential exposure by role instead of expanding shared
  provider-env pass-through.
- Secret access audit logs tied to task ID.
- Do not describe the current env allowlist as a sandbox. It is partial
  hardening, not full process isolation.
