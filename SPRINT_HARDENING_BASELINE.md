# SPRINT_HARDENING_BASELINE.md

Historical sprint note.

The hardening sprint is no longer the active documentation anchor. Its runtime
changes should now be read from the existing canonical docs:

- `../OPENCLAW_CONTEXT_ANCHOR.md` for repo-wide runtime and governance truth
- `README.md` for the public workspace entrypoint
- `docs/OPENCLAW_KB/00_SYSTEM_TRUTH.md`
- `docs/OPENCLAW_KB/01_CONTROL_PLANE.md`
- `docs/OPENCLAW_KB/02_GATEWAY_AND_POLICY.md`
- `docs/OPENCLAW_KB/03_AGENT_ISOLATION.md`
- `docs/OPENCLAW_KB/security/CREDENTIAL_BOUNDARIES.md`
- `docs/OPENCLAW_KB/security/POLICY_ENFORCEMENT.md`
- `docs/OPENCLAW_KB/operations/RUNTIME_BEHAVIOR.md`
- `docs/OPENCLAW_KB/operations/FAILURE_MODES.md`
- `openclawdbot/README.md`
- `docs/CLAWDBOT_MILESTONES.md`
- `docs/operations/MILESTONE_PIPELINE_RUNBOOK.md`

What the sprint materially changed:

- removed active code-known default-secret bootstrap behavior in `openclawdbot`
- added explicit context gating to internal mutating app routes
- hardened orchestrator bearer-token comparison
- narrowed direct task-run bypasses for agent entrypoints
- replaced full inherited child env with an allowlisted child env
- bounded persisted `redditQueue`
- made restart-interrupted retries explicit failures instead of ambiguous `retrying`
- made ingest routes treat Redis commit as the durable success boundary even if realtime fan-out fails

This file should remain only as a short historical pointer unless a future
hardening sprint needs a temporary implementation contract again.
