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

## Release Notes

- Custom-post apps still require Reddit platform review before a submitted build
  becomes fully live.
- Code and app config are the source of truth. This README is the subproject
  entrypoint, not the canonical contract for every route.
- Material app code/config changes should update the appropriate existing `.md`
  file in the same change set and reference the affected routes, views, or
  config paths where useful.
- The public UI now exposes three surfaces:
  `Proof`, `Control`, and `Demand`.
- The public API surface now includes:
  `/api/command-center/overview`,
  `/api/command-center/control`,
  `/api/command-center/demand`,
  `/api/command-center/demand-live`.
- The internal signed ingest surface now includes:
  `/internal/milestones/ingest`,
  `/internal/demand/ingest`.
- Demand telemetry is a parallel signed structured channel. It is not part of
  the milestone timeline, and it currently reuses the same signing secret path
  as milestone ingest.
- For the milestone pipeline contract, use `../docs/CLAWDBOT_MILESTONES.md`,
  `../docs/operations/MILESTONE_INGEST_CONTRACT.md`, and
  `../docs/operations/MILESTONE_PIPELINE_RUNBOOK.md`.
