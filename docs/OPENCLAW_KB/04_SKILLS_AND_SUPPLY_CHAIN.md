# Skills Runtime and Supply Chain Governance

Last reviewed: 2026-02-28

## Current Runtime Behavior

Verified:

- Skills are implemented in `skills/*.ts`.
- `skills/index.ts` contains the current skill-registry bootstrap path and now
  uses the explicit named `auditSkill()` export from
  `orchestrator/src/skillAudit.ts`, so the SkillAudit contract is coherent at
  the bootstrap boundary.
- `skills/index.ts` now supports both:
  - the explicit/manual `initializeSkills()` bootstrap path, and
  - lazy bootstrap on the first `executeSkill()` call
  so active skill-execution paths no longer depend on preloaded registry state.
- `skills/index.ts` now also exposes a narrow governed intake path for
  non-built-in skills through `registerGovernedSkill()`. Generated/imported
  skills do not become executable on the normal `executeSkill()` path unless
  that intake path stages them and `approveGovernedSkill()` explicitly
  approves them. That approval step now also checks for a reviewable
  provenance snapshot. When a requesting agent is supplied, ToolGate and
  manifest skill allowlists still apply after approval.
- `skills/index.ts` now persists governed skill trust state through the
  existing orchestrator JSON state file. Approved governed skills with builtin
  executor bindings are rehydrated during skill bootstrap after restart;
  governed skills without a restart-safe executor binding persist as metadata
  only and remain non-executable until they are re-registered.
- The protected `/api/dashboard/overview` operator surface now exposes the
  governed skill trust split from `OrchestratorState.governedSkillState`,
  including pending-review versus approved state and restart-safe versus
  metadata-only durability.
- `skills/index.ts` now uses ToolGate preflight (`preflightSkillAccess()`; the
  legacy `executeSkill()` name remains a compatibility alias) when a requesting
  agent is provided.
- `taskHandlers.ts` also performs ToolGate preflight before spawned-agent tasks
  are executed.

This means the skill layer now has a real ToolGate authorization hook, while
SkillAudit now has a real bootstrap-backed runtime path for the skill registry,
and a narrow governed intake scaffold with partial restart-safe durability for
non-built-in skills, but it still remains partial in scope rather than a
universal enforcement layer.

## What The Audit Gate Actually Covers

`SkillAuditGate` currently evaluates:

- provenance metadata
- permission bounds
- dangerous runtime patterns
- direct secret access
- input/output schema presence

That is a meaningful supply-chain review step for skills loaded through the
registry, but governed skill intake now also requires an explicit review step
before the staged skill becomes executable.

## Remaining Runtime Limits

- ToolGate authorization is real, but it still acts as a preflight permission
  check and audit log, not a full filesystem/network/process sandbox.
- Some risky behaviors still depend on executor implementation rather than a
  universal host-level policy layer.
- Child-process tasks in `taskHandlers.ts` do not force every action through the
  skill registry; some execution remains agent-process based rather than
  skill-gateway based.

## Current Risk Notes

- `sourceFetch` safety depends on its executor and declared bounds, not a global
  egress firewall.
- `documentParser` now gets a real manifest-backed read-path check on the
  current `input.filePath` execution path, but `workspacePatch` and broader
  file/network constraints remain only partially enforced.
- `testRunner` still represents command execution and therefore deserves tighter
  scrutiny than read-only skills.

## Governance Actions

1. Keep `preflightSkillAccess()` (and the legacy `executeSkill()` compatibility
   alias) as the canonical ToolGate preflight layer for direct skill calls.
2. Keep both the explicit/manual `initializeSkills()` path and the lazy
   `executeSkill()` bootstrap path coherent; they are now the trusted registry
   bootstrap surfaces.
3. Keep `registerGovernedSkill()` plus `approveGovernedSkill()` as the only
   supported intake and trust path for generated/imported skills on the normal
   skill path.
4. Keep `OrchestratorState.governedSkillState` as the current narrow durable
   governed-skill store; restart-safe execution should only be assumed for
   approved governed skills with a rehydratable executor binding.
5. Add stronger process-level enforcement for file, network, and environment
   boundaries.
6. Continue treating skill metadata as necessary but not sufficient for runtime
   safety.
