# Claims vs Reality Matrix

Last reviewed: 2026-02-28

## Claim: Task Intake Is Deny-by-Default

- Claim source: runtime intent and current docs
- Runtime evidence: `ALLOWED_TASK_TYPES`, `TaskTriggerSchema`, and
  `TaskQueue.enqueue()` all enforce allowlisting
- Verdict: **Implemented**

## Claim: ToolGate Exists in Runtime

- Claim source: current runtime design
- Runtime evidence: `orchestrator/src/toolGate.ts` exists and is used by
  `taskHandlers.ts` and `skills/index.ts`
- Verdict: **Implemented, but partial in scope**

It is a real authorization layer. It is not yet the same thing as universal
host-level execution isolation.

## Claim: Skill Audit Runs During Skill Registration

- Claim source: current skill loader design
- Runtime evidence: `skills/index.ts` imports and uses
  `orchestrator/src/skillAudit.ts`
- Verdict: **Implemented**

## Claim: The Broader Agent Task Surface Is Wired

- Claim source: current agent catalog and task docs
- Runtime evidence: `taskHandlers.ts` now wires the extended agent task set,
  including `market-research`, `data-extraction`, `qa-verification`, and
  `skill-audit`
- Verdict: **Implemented for the canonical task map**

## Claim: Orchestrator Is the Only Execution Authority

- Claim source: architecture intent
- Runtime evidence: the repo still includes multiple agent systemd units that
  can run outside the queue path
- Verdict: **Not strictly enforced operationally**

## Claim: Runtime Controls Are Fully Closed

- Claim source: safe-autonomy ambition
- Runtime evidence: task allowlisting and gate preflight improved, but process
  isolation, environment filtering, and deployment-surface consolidation remain
  incomplete
- Verdict: **Directionally stronger, not fully closed**
