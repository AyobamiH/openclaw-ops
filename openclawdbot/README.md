# OpenClawDBot

`openclawdbot` is the Reddit / Devvit surface for OpenClaw. It creates and
renders the custom-post milestone experience, exposes the app-side milestone
ingest and feed routes, and gives moderators controls for wiring the live
pipeline.

## What It Does

- creates the custom post surface used in Reddit
- renders the compact and expanded UI in `src/client/`
- exposes public client APIs and internal app actions in `src/server/`
- accepts signed milestone ingest from the orchestrator
- maintains the canonical `milestones-feed` wiki page and refresh scheduler

## Current Runtime Shape

Key files:

- `devvit.json`: app manifest, permissions, and custom-post configuration
- `src/server/index.ts`: Hono app bootstrap
- `src/server/routes/triggers.ts`: install/upgrade bootstrap and post creation
- `src/server/routes/menu.ts`: moderator actions
- `src/server/routes/milestones.ts`: ingest + latest feed routes
- `src/server/routes/scheduler.ts`: remote feed polling, wiki sync, realtime
- `src/client/splash.tsx`: compact Reddit view
- `src/client/game.tsx`: expanded Reddit view

This is no longer a starter template. It is the active milestone delivery app
for the OpenClaw project.

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
- For the milestone pipeline contract, use `../docs/CLAWDBOT_MILESTONES.md`,
  `../docs/operations/MILESTONE_INGEST_CONTRACT.md`, and
  `../docs/operations/MILESTONE_PIPELINE_RUNBOOK.md`.
