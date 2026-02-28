# OpenClaw Orchestrator

This directory contains the OpenClaw control plane. It is the runtime that
accepts tasks, applies policy, dispatches work, records state, and emits
milestone updates for downstream surfaces such as `openclawdbot`.

## What Lives Here

- `src/index.ts`: runtime bootstrap and HTTP surface
- `src/taskHandlers.ts`: task allowlist and dispatch logic
- `src/milestones/`: milestone emission and feed publishing
- `orchestrator_config.json`: local runtime configuration
- `docker-compose.yml`: full local stack for orchestrator + dependencies

For repo-wide orientation, start with `../README.md` and
`../OPENCLAW_CONTEXT_ANCHOR.md`.

## Canonical Local Compose

Use `orchestrator/docker-compose.yml` when you need the full local development
stack, including the orchestrator and its supporting services.

The repo root also contains `../docker-compose.yml`, but that file is a smaller
alternative and is not a drop-in replacement for this one.

## Common Commands

From this directory:

```bash
npm install
npm run dev
npm run build
npm run test:run
```

Useful targeted checks:

- `npm run test:unit:fixtures`
- `npm run test:integration`
- `npm run docs:check-sync`

## Operational Notes

- Do not run the root and orchestrator compose stacks at the same time unless
  you have intentionally reconciled their port/container overlap.
- Code and config are the source of truth. This README is a current entrypoint,
  not a replacement for the implementation.
- The active documentation surface for runtime and operations lives under
  `../docs/`.
