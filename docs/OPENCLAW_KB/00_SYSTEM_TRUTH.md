# OpenClaw Runtime Truth (Verified)

Last updated: 2026-02-23
Scope: Runtime architecture and governance controls verified from source code and deployment files.

## 1) Canonical Control Plane

**Verified**
- `orchestrator/src/index.ts` is the only scheduler + queue bootstrap.
- Task execution enters through `TaskQueue.enqueue()` in `orchestrator/src/taskQueue.ts` and dispatches via `resolveTaskHandler()` in `orchestrator/src/taskHandlers.ts`.
- Public/protected HTTP routes are also defined in `orchestrator/src/index.ts`.

**Assumed**
- No external control-plane process is running unless deployed separately (not proven by code alone).

## 2) Runtime Dispatch Model

**Verified**
- Most orchestrated agent tasks are executed by spawned child processes via temp payload/result files (`runSpawnedAgentJob()` in `orchestrator/src/taskHandlers.ts`).
- Canonical spawned-agent contract is documented in `docs/OPENCLAW_KB/operations/AGENT_EXECUTION_CONTRACT.md` (hard cutover; no backward compatibility).
- Dispatch coverage currently exists for:
  - `security-audit` -> `security-agent`
  - `summarize-content` -> `summarization-agent`
  - `system-monitor` -> `system-monitor-agent`
  - `build-refactor` -> `build-refactor-agent`
  - `content-generate` -> `content-agent`
  - `integration-workflow` -> `integration-agent`
  - `normalize-data` -> `normalization-agent`
  - `market-research` -> `market-research-agent`
  - `data-extraction` -> `data-extraction-agent`
  - `qa-verification` -> `qa-verification-agent`
  - `skill-audit` -> `skill-audit-agent`
  - `drift-repair` -> `doc-specialist`
  - `reddit-response` -> `reddit-helper`

**Verified**
- Trigger schema allowlist (`TaskTriggerSchema` in `orchestrator/src/middleware/validation.ts`) includes all currently mapped orchestrator task types, including `market-research`, `data-extraction`, `qa-verification`, and `skill-audit`.

## 3) API Exposure

**Verified public endpoints**
- `GET /health`
- `GET /api/knowledge/summary`
- `GET /api/persistence/health`

**Verified protected endpoints**
- `POST /api/tasks/trigger` (Bearer token + validation + rate limits)
- `POST /webhook/alerts` (HMAC signature + validation + rate limits)
- `POST /api/knowledge/query`
- `GET /api/knowledge/export`
- `GET /api/persistence/historical`
- `GET /api/persistence/export`

## 4) Security Controls (Implemented)

**Verified**
- Startup hard-fail if critical env vars missing (`verifySecurityPosture()` in `orchestrator/src/index.ts`).
- Bearer token auth middleware (`orchestrator/src/middleware/auth.ts`).
- Webhook signature validation middleware (`orchestrator/src/middleware/auth.ts`).
- Zod request validation (`orchestrator/src/middleware/validation.ts`).
- Endpoint-level rate limiting (`orchestrator/src/middleware/rate-limit.ts`).

## 5) Safety Gaps (Claims vs Runtime)

**Verified gaps**
- `skills/index.ts` imports `../orchestrator/src/skillAudit.js`, but `orchestrator/src/skillAudit.ts` is absent.
- `skills/index.ts` comments reference runtime `toolGate.ts`, but no such runtime module exists in `orchestrator/src`.
- Integration tests under `orchestrator/test/integration/*.test.ts` are fixture/simulation heavy and do not enforce real runtime permission middleware or queue dispatch behavior.

## 6) Deployment Reality

**Verified**
- Two compose surfaces exist: root `docker-compose.yml` and `orchestrator/docker-compose.yml` with different assumptions.
- systemd units exist for orchestrator and standalone `doc-specialist`/`reddit-helper` services.

**Risk implication**
- Running standalone services can bypass orchestrator-only dispatch policy if operators invoke agent services directly.
