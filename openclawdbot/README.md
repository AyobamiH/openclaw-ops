# OpenClawDBot

`openclawdbot` is the Reddit / Devvit command center for OpenClaw. It renders
the public proof boundary, exposes the app-side command-center and milestone
routes, and gives moderators the controls needed to keep the live pipeline
healthy.

## What It Does

- creates the custom post surface used in Reddit
- renders the compact preview and expanded command-center UI in `src/client/`
- exposes public client APIs and internal app actions in `src/server/`
- accepts signed milestone ingest from the orchestrator
- accepts signed demand-summary ingest from the orchestrator
- maintains the canonical `milestones-feed` wiki page and refresh scheduler
- requires an explicitly configured signing secret before it will sign
  bootstrap or recovery feed content
- expects orchestrator to point `milestoneIngestUrl` and
  `demandSummaryIngestUrl` at this app’s internal signed-ingest endpoints
  (`/internal/milestones/ingest`, `/internal/demand/ingest`) for automatic
  proof-feed updates

## Current Runtime Shape

Key files:

- `devvit.json`: app manifest, permissions, and custom-post configuration
- `src/server/index.ts`: Hono app bootstrap
- `src/server/routes/triggers.ts`: install/upgrade bootstrap and post creation
- `src/server/routes/menu.ts`: moderator actions
- `src/server/routes/milestones.ts`: ingest + latest feed routes
- `src/server/routes/demand.ts`: signed demand-summary ingest + live demand feed
- `src/server/routes/api.ts`: command-center overview, control, and demand APIs
- `src/server/routes/scheduler.ts`: remote feed polling, wiki sync, realtime
- `src/client/splash.tsx`: compact Reddit preview of the command center
- `src/client/game.tsx`: expanded Proof / Control / Demand command center

This is no longer a starter template. It is the active milestone delivery app
and public proof surface for the OpenClaw project.

Source-of-truth note:

- Runtime code and app config are the source of truth.
- Subproject governance truth defers to root `../OPENCLAW_CONTEXT_ANCHOR.md`
  and active runtime code.
- This README is the subproject anchor, but it should not overstate protections
  beyond what the live server routes actually enforce.

## Common Commands

From this directory:

```bash
npm install
npm run dev
npm run build
```

Release commands:

- `npm run deploy`: type-check, lint, and upload a new app build
- `npm run launch`: upload and submit the build for Reddit review / publish
- `npm run login`: authenticate the Devvit CLI

Validation commands:

- `npm run type-check`
- `npm run lint`
- `npm run test`

Standalone proof service:

- `PATH=/home/oneclickwebsitedesignfactory/.nvm/versions/node/v24.12.0/bin:$PATH npm run build`
- `WEBBIT_PORT=3310 MILESTONE_SIGNING_SECRET=... node dist/server/index.cjs`
- `systemd/openclawdbot.service` is the canonical local production entrypoint.
- `systemd/cloudflared-openclawdbot.service` is the canonical public-tunnel
  companion when you want `openclawdbot` reachable through its Cloudflare
  hostname as part of the orchestrator startup chain.
- Standalone mode persists proof state to
  `openclawdbot/data/standalone-state.json` by default. Override with
  `OPENCLAWDBOT_STATE_PATH` if you need a different location.
- When Devvit Redis config is unavailable, signed ingest falls back to
  `MILESTONE_SIGNING_SECRET` from the environment so the orchestrator can still
  deliver milestones and demand summaries to the local proof surface.

## Release Notes

- Custom-post apps still require Reddit platform review before a submitted build
  becomes fully live.
- Code and app config are the source of truth. This README is the subproject
  entrypoint, not the canonical contract for every route.
- Material app code/config changes should update the appropriate existing `.md`
  file in the same change set and reference the affected routes, views, or
  config paths where useful.
- The standalone/systemd proof service is now a first-class local runtime:
  `dist/server/index.cjs` on `WEBBIT_PORT=3310` is the canonical local
  entrypoint, and the public proof APIs use file-backed fallback state when the
  Devvit runtime is absent.
- The public hostname half is now modeled explicitly as a separate managed
  systemd dependency:
  `systemd/cloudflared-openclawdbot.service` reads
  `OPENCLAWDBOT_TUNNEL_TOKEN` from `orchestrator/.env`, binds to
  `openclawdbot.service`, and is intended to come up alongside the
  orchestrator-managed proof runtime.
- The public UI now exposes three surfaces:
  `Proof`, `Control`, and `Demand`.
- The public API surface now includes:
  `/api/command-center/overview`,
  `/api/command-center/control`,
  `/api/command-center/demand`,
  `/api/command-center/demand-live`,
  `/api/milestones/latest`,
  `/api/milestones/dead-letter`.
- The public proof API surface now serves CORS headers for cross-origin
  read-only access:
  `Access-Control-Allow-Origin: *`,
  `Access-Control-Allow-Headers: Content-Type`,
  `Access-Control-Allow-Methods: GET, OPTIONS`.
- The internal signed ingest surface now includes:
  `/internal/milestones/ingest`,
  `/internal/demand/ingest`.
- Internal state-changing routes are now explicitly context-gated:
  - `/internal/menu/*`, `/internal/form/*`, and `/internal/scheduler/*`
    require interactive-user context
  - `/internal/triggers/*` rejects interactive-user context and expects
    lifecycle-only execution
- Signed ingest routes remain HMAC-gated by
  `x-openclaw-signature` + `x-openclaw-timestamp` and are not
  interactive-user-context routes.
- Demand telemetry is a parallel signed structured channel. It is not part of
  the milestone timeline, and it currently reuses the same signing secret path
  as milestone ingest.
- The app no longer restores or auto-seeds a code-known default signing secret.
  Milestone and demand bootstrap/recovery paths fail closed until the Redis
  signing secret is configured.
- The app is a public proof and control surface, not the full orchestrator
  governance boundary. ToolGate, SkillAudit, and manifest permission expansion
  remain control-plane concerns outside this subproject.
- For the milestone pipeline contract, use `../docs/CLAWDBOT_MILESTONES.md`,
  `../docs/operations/MILESTONE_INGEST_CONTRACT.md`, and
  `../docs/operations/MILESTONE_PIPELINE_RUNBOOK.md`.
