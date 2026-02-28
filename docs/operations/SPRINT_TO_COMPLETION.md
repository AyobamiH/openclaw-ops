# Sprint To Completion

Status: Active implementation plan  
Last updated: 2026-02-27  
Owner: Workspace maintainers (orchestrator + agents + openclawdbot)

## Objective

Ship a complete, public-ready OpenClaw workspace with:

1. Accurate docs that match runtime behavior.
2. Stable multi-agent orchestration path.
3. Stable single-agent/direct-service path.
4. Working milestone delivery from internal runtime to Reddit app surface.
5. Clear GitHub navigation for new operators and contributors.

## Scope

In scope:

- `orchestrator/` runtime and deployment truth.
- `agents/` execution contract and service boundaries.
- `openclawdbot/` milestone ingestion + display contract.
- Docs, runbooks, and anchor hardening.
- Repo hygiene for runtime artifacts and publish boundaries.

Out of scope (for this sprint):

- Feature redesign unrelated to runtime reliability.
- Cleanup/deletion campaigns without evidence and governance checks.
- Replacing both Docker paths with a single mode.

## Track 1: Runtime Truth And Drift Control

### Deliverables

1. Lock canonical truth to:
   - `OPENCLAW_CONTEXT_ANCHOR.md` (root)
   - `workspace/orchestrator_config.json`
   - `workspace/orchestrator/src/*.ts`
2. Add explicit "drift-check" loop before doc edits:
   - run `workspace/scripts/audit_context_anchor_recon.sh`
   - compare with anchor + README + operator docs
3. Keep `workspace/OPENCLAW_CONTEXT_ANCHOR.md` as non-canonical stub only.

### Acceptance Criteria

1. Anchor references both Docker modes and runtime boundaries.
2. Every major README claim maps to a file path in repo.
3. Drift conflicts are recorded in docs with "code/config wins" rule.

## Track 2: Milestone Pipeline To Reddit App

### Deliverables

1. Shared milestone schema (Zod/types) for producer + consumer.
2. Milestone emitter in orchestrator path.
3. Delivery bridge with signed requests, retry, dead-letter, idempotency.
4. `openclawdbot` ingest endpoint + feed endpoint for app rendering.
5. End-to-end tests: emit -> queue -> ingest -> visible feed.

### Acceptance Criteria

1. `docs/CLAWDBOT_MILESTONES.md` fields are enforced in code.
2. Duplicate milestone IDs do not create duplicate posts.
3. Unsigned or replayed payloads are rejected.
4. Failed deliveries are observable via queue/dead-letter state.

Reference: `docs/operations/clawdbot-milestone-delivery-plan.md`

## Track 3: Public GitHub Experience (Multi-Tab Docs)

### Deliverables

1. README "tabbed" navigation sections for:
   - Overview
   - Quick Start
   - Runtime Modes
   - Docker/Deploy
   - Operations
   - Architecture
   - Milestones + Reddit
   - Governance/Security
2. `docs/INDEX.md` and `docs/NAVIGATION.md` include sprint + milestone plan links.
3. Public setup instructions verified for both npm workflow and Docker workflow.

### Acceptance Criteria

1. New contributor can find run instructions in under 2 minutes.
2. Operators can distinguish root compose vs orchestrator compose quickly.
3. No critical operational doc is only discoverable by deep path browsing.

## Track 4: Operational Hardening

### Deliverables

1. Verify Prometheus/Grafana/Alertmanager docs against real compose/runtime.
2. Resolve contradictions between phase completion docs and current code paths.
3. Validate security controls:
   - API key auth
   - webhook signature checks
   - rate limits
   - approval gates
4. Ensure runtime artifacts are excluded from publish defaults.

### Acceptance Criteria

1. Monitoring stack can be started from documented command path.
2. Alert webhook path and auth rules are documented once, consistently.
3. Secret leakage scan returns no committed credentials.

## Sprint Order (Execution Sequence)

1. Sprint A: Drift Control + docs truth baseline.
2. Sprint B: Milestone schema + emitter + ingestion endpoint.
3. Sprint C: Delivery bridge + idempotency + retries + tests.
4. Sprint D: GitHub experience polish + operator runbook finalization.

## Definition Of Done

1. End-to-end milestone event appears in app feed from runtime source.
2. README, docs index, and anchor all agree on runtime modes and entrypoints.
3. Both Docker workflows are documented with non-conflicting guidance.
4. Security-critical endpoints and env requirements are explicit.
5. No unverified claims remain in public-facing docs.

## Verification Checklist

- `npm --prefix orchestrator run test`
- `npm --prefix orchestrator run test:integration`
- `docker compose -f docker-compose.yml config --services`
- `docker compose -f orchestrator/docker-compose.yml config --services`
- `grep -R \"milestone\" openclawdbot orchestrator docs`

