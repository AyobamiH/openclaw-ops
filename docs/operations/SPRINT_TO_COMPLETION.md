# Sprint To Completion

Status: Active implementation plan
Last updated: 2026-02-28
Owner: Workspace maintainers

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

## Active Work Tracks

## Track 1: Documentation Truth

### Goal

Keep docs aligned to live code and remove ambiguity about what is canonical.

### Remaining Work

1. Complete deeper freshness review for `docs/OPENCLAW_KB/**`
2. Run the same audit pass on subproject docs (`orchestrator/`, `openclawdbot/`,
   agent READMEs)
3. Keep root navigation and docs navigation in sync after future code changes

## Track 2: Milestone Pipeline Hardening

### Goal

Extend the already-working milestone path into a broader operational surface.

### Remaining Work

1. Expand milestone emission to more important runtime outcomes
2. Decide explicitly whether a standalone bridge worker is permanently retired
   or deferred
3. Keep the runbook and delivery plan aligned with the direct-emitter design

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

## Definition Of Done

1. Canonical docs and code agree on runtime behavior
2. Historical docs are clearly labeled and no longer masquerade as active truth
3. Milestone pipeline docs match the implemented code path
4. Public navigation is stable and link-safe
5. Remaining open work is operational/release closure, not documentation drift
