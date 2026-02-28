# Skills Runtime and Supply Chain Governance

Last reviewed: 2026-02-28

## Current Runtime Behavior

Verified:

- Skills are implemented in `skills/*.ts`.
- `skills/index.ts` now loads definitions, audits each skill through
  `orchestrator/src/skillAudit.ts`, and only registers skills whose audit
  passes.
- `executeSkill()` in `skills/index.ts` now asks ToolGate for permission when a
  requesting agent is provided.
- `taskHandlers.ts` also performs ToolGate preflight before spawned-agent tasks
  are executed.

This means the skill layer now has real audit and authorization hooks, not just
placeholder references.

## What The Audit Gate Actually Covers

`SkillAuditGate` currently evaluates:

- provenance metadata
- permission bounds
- dangerous runtime patterns
- direct secret access
- input/output schema presence

That is a meaningful supply-chain review step for skills loaded through the
registry.

## Remaining Runtime Limits

- ToolGate authorization is real, but it still acts as a permission check and
  audit log, not a full filesystem/network/process sandbox.
- Some risky behaviors still depend on executor implementation rather than a
  universal host-level policy layer.
- Child-process tasks in `taskHandlers.ts` do not force every action through the
  skill registry; some execution remains agent-process based rather than
  skill-gateway based.

## Current Risk Notes

- `sourceFetch` safety depends on its executor and declared bounds, not a global
  egress firewall.
- `documentParser` and `workspacePatch` remain sensitive because path safety is
  partly implementation-specific.
- `testRunner` still represents command execution and therefore deserves tighter
  scrutiny than read-only skills.

## Governance Actions

1. Keep `executeSkill()` and ToolGate as the canonical authorization layer for
   direct skill calls.
2. Add stronger process-level enforcement for file, network, and environment
   boundaries.
3. Continue treating skill metadata as necessary but not sufficient for runtime
   safety.
