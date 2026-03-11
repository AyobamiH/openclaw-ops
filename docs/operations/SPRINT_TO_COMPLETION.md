# Sprint To Completion

Status: Active implementation plan
Last updated: 2026-03-09
Owner: Workspace maintainers

Forward implementation authority lives in the root `OPENCLAW_CONTEXT_ANCHOR.md`.
This file tracks execution sequencing and remaining work only; it is not the canonical runtime truth source or the primary roadmap authority.
Do not use this file to introduce a parallel sprint ladder or to override the
root anchor's implementation contract. If sequencing here conflicts with the
anchor, the anchor wins and this tracker must be updated.

## Objective

Close the remaining gap between code truth, operational docs, and the public
release surface.

## Current Snapshot

### Already Landed

1. The orchestrator runtime is active and materially broader than the early
   docs implied.
2. The milestone pipeline is implemented end-to-end in code:
   - shared schema
   - orchestrator emitter
   - signed delivery
   - app ingest
   - app feed
   - duplicate and rejection handling
3. The Reddit app UI is live as an uploadable Devvit surface and can be
   submitted for review.

### Still Open

1. Documentation truth still needs continued alignment in deeper secondary docs.
2. Public navigation still needs ongoing hardening so historical docs are not
   mistaken for active truth.
3. Platform-side Devvit review remains an external gate before broad publish.
4. Some runtime milestone coverage is still selective rather than exhaustive.
5. The forward implementation ladder now lives in `../OPENCLAW_CONTEXT_ANCHOR.md`; this file should track execution progress, not replace the canonical anchor.

## Active Work Tracks

## Track 1: Documentation Truth

### Goal

Keep docs aligned to live code and remove ambiguity about what is canonical.

### Remaining Work

1. Keep the canonical anchor, root README, docs index, and KB truth docs aligned
   with runtime code
2. Keep subproject docs aligned without creating competing truth layers
3. Keep root navigation and docs navigation in sync after future code changes

## Track 2: Milestone Pipeline Hardening

### Goal

Extend the already-working milestone path into a broader operational surface.

### Remaining Work

1. Expand milestone emission to more important runtime outcomes
2. Keep demand and milestone telemetry docs aligned with the direct-emitter design
3. Preserve the public proof boundary while expanding operator visibility

## Forward Governance Ladder

The canonical “next 10 sprints” contract is in `../OPENCLAW_CONTEXT_ANCHOR.md`.
This plan should track execution against that anchor, not invent or replace a competing roadmap.

## Current End-To-End Sprint Ladder

This is the current execution order for release hardening. It is intentionally
ordered by operational dependency, not by subsystem ownership.

### Sprint 1: Reddit Response Release Proof

Goal: finish the `reddit-response` release path so the routing, approvals,
fallbacks, and provider branch are all evidence-backed.

Remaining work:

1. Prove one successful live `hybrid-polished` draft against the provider
   rather than only the current `429 quota exceeded` fallback.
2. Keep `priority`, `draft-review`, and `manual-review` routing truth aligned
   to runtime code and approval replay behavior.
3. Keep `reddit-helper` token-safety controls documented:
   - dedupe
   - throttles
   - daily budgets
   - deterministic scoring
   - local-first hybrid drafting

### Sprint 2: Production Boot Without Fast-Start

Goal: prove the orchestrator can run on the canonical production path without
falling back to fast-start.

Status: completed on `2026-03-09`.

Outcome:

1. The real non-fast-start launch now runs on port `3312`.
2. Mongo-backed persistence, MemoryScheduler, KnowledgeIntegration, and snapshot
   writes are proven on the canonical runtime path.
3. Snapshot writes now follow `resolve(config.logsDir, "snapshots")`, avoiding
   the legacy misowned `orchestrator/data/snapshots` tree.

### Sprint 3: Agent Service Truth

Goal: make service-mode claims fully evidence-backed instead of only
file-availability-backed.

Status: completed on `2026-03-09`.

Outcome:

1. `/api/agents/overview` and `/api/health/extended` now distinguish
   `serviceAvailable`, `serviceInstalled`, and `serviceRunning`.
2. `serviceRunning=false` is now host-proven truth when a matching unit is
   absent or inactive; `null` is reserved for probe-unavailable cases.
3. On the current host, agent service units are not installed, so the live
   aggregate truth is `serviceAvailableCount=13`, `serviceInstalledCount=0`,
   `serviceRunningCount=0`.

### Sprint 4: Milestone And Demand Delivery Proof

Goal: finish proof of the signed delivery surfaces against real endpoints.

Remaining work:

1. Replace placeholder/failing ingest targets with real reachable endpoints.
2. Prove end-to-end milestone delivery and demand delivery on those endpoints.
3. Keep runbooks and public proof language aligned with the real delivery path.

### Sprint 5: Operator API Contract Completion

Goal: finish the operator-facing API as a release-quality contract, not just a
route inventory.

Remaining work:

1. Keep `docs/reference/api.md` aligned route-by-route with runtime.
2. Expand `orchestrator/src/openapi.ts` so the operator surfaces have clearer
   request/response schema detail where it materially helps release consumers.
3. Re-verify that the built-in operator UI and Lovable-facing guidance use the
   authoritative routes and fields.

### Sprint 6: Public Docs And Release Truth Closure

Goal: leave no stale or competing truth layers around release-critical
surfaces.

Remaining work:

1. Keep `MEMORY.md`, the root anchor, subproject READMEs, and operator runbooks
   aligned with the current runtime.
2. Keep historical docs clearly demoted and prevent them from masquerading as
   active truth.
3. Close remaining navigation and public-readability gaps before broad release.

### Sprint 7: Redis / Valkey Coordination Activation (Deferred)

Goal: only make Redis/Valkey real when the first bounded coordination slice is
implemented.

Remaining work:

1. Implement shared claims and repair locks as the first real coordination
   slice.
2. Move anti-storm cooldowns and shared budgets onto Redis/Valkey only after
   that first slice is real.
3. Add operator-visible Redis coordination health only after a real client and
   runtime checks exist.

## Track 3: Public GitHub Experience

### Goal

Make the repo readable to new operators without stale detours.

### Remaining Work

1. Keep `README.md`, `docs/INDEX.md`, and `docs/NAVIGATION.md` as the obvious
   public path
2. Continue demoting or clearly labeling historical snapshot docs
3. Verify first-party Markdown links regularly

## Track 4: Operational Closure

### Goal

Finish the remaining validation and release tasks around the live runtime.

### Remaining Work

1. Re-verify monitoring and security docs against the current runtime
2. Maintain zero-conflict docs for both Docker modes
3. Complete live publish/review flow for `openclawdbot` as Reddit approvals
   allow

## Track 5: Redis / Valkey Coordination Activation

### Goal

Make Redis or Valkey a real runtime dependency only when the first production
coordination slice is implemented, rather than leaving it as posture-only
configuration.

### Remaining Work

1. Implement a narrow first slice for shared job claims and repair locks so
   multi-process workers cannot duplicate backlog work.
2. Move anti-storm cooldowns, retry budgets, and daily LLM/call budgets for
   autonomous helper loops onto shared coordination state once the claim/lock
   layer is real.
3. Add operator-visible evidence for Redis-backed coordination health only
   after a real client and runtime checks exist; until then, Redis/Valkey
   remains deferred integration rather than active runtime truth.

## Definition Of Done

1. Canonical docs and code agree on runtime behavior
2. Historical docs are clearly labeled and no longer masquerade as active truth
3. Milestone pipeline docs match the implemented code path
4. Public navigation is stable and link-safe
5. Remaining open work is operational/release closure, not documentation drift
