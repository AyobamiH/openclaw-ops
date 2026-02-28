# Orchestrator Service

This directory contains the OpenClaw orchestrator runtime.

## Canonical Local Dev Compose

The canonical Docker Compose entrypoint for full local development is:
- `orchestrator/docker-compose.yml`

Use this file when you need orchestrator + MongoDB + Redis + monitoring services together.

## Minimal Alternative

A separate minimal stack exists at repo root:
- `docker-compose.yml`

Use the root compose only for lightweight orchestrator-only container runs.

## Quick Start

From this directory:

```bash
docker compose up -d --build
docker compose ps
```

## Notes

- These two compose files are intentionally different and are not drop-in equivalents.
- Running both simultaneously can cause container name and port conflicts.
- For broader repository context, see the root README.
