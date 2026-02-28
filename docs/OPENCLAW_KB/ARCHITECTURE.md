# OpenClaw Runtime Architecture (Verified)

Last updated: 2026-02-24

## Executive Overview
This system has a real orchestrator control plane for API-triggered task intake and scheduled task routing, but it is **not yet the sole execution authority** because multiple agents can also run as standalone systemd services.

## Runtime Topology
- Control service: `orchestrator/src/index.ts`
- Queue + routing: `TaskQueue.enqueue()` + `resolveTaskHandler()`
- Worker execution pattern:
  - In-process task handlers
  - Spawned child processes for selected agents via `runSpawnedAgentJob()`
  - Hard-cutover spawned-agent execution contract (no backward compatibility): `docs/OPENCLAW_KB/operations/AGENT_EXECUTION_CONTRACT.md`
  - Optional standalone agent services under `systemd/*.service`
- Persistence surfaces:
  - `orchestrator_state.json` (state snapshots)
  - MongoDB via `PersistenceIntegration`
  - Logs/artifacts under workspace paths from `orchestrator_config.json`

## Control Boundaries (Actual)
- API entry points enforce middleware stack (auth/signature/rate limit/validation).
- Queue only accepts allowlisted task types.
- Unknown tasks become structured errors.
- However, local process-level write access to state/log files is not cryptographically protected.

## High-Risk Structural Drift
1. Dual execution modes (orchestrator-dispatched + standalone services) allow governance divergence if direct services are operated independently.
2. Agent policy declarations in `agent.config.json` are not comprehensively enforced by shared runtime gate for filesystem/network/secrets.
3. Tool gate exists but is currently placeholder-initialized and not wired as a hard mandatory path for all execution.

## Safe-Scaling Prerequisites
- Single mandatory dispatch plane for all agent execution.
- Runtime-enforced policy engine bound to every skill/tool invocation.
- Tamper-evident state mutation trail for `orchestrator_state.json` and operational artifacts.
