# Claims vs Reality Matrix

Last updated: 2026-02-24

## Declared Claim: Deny-by-Default ToolGate Enforcement

- **Claim source**: `skills/index.ts` comments + long-term docs.
- **Runtime evidence**: `orchestrator/src` has no `toolGate` implementation.
- **Verdict**: **Not implemented in orchestrator runtime**.

## Declared Claim: Skill Audit Gate at Startup

- **Claim source**: `skills/index.ts` dynamic import of `skillAudit.js`.
- **Runtime evidence**: `orchestrator/src/skillAudit.ts` not present.
- **Verdict**: **Broken/absent dependency path**.

## Declared Claim: Full 11-Agent Orchestration

- **Claim source**: docs/memory narrative and agent configs.
- **Runtime evidence**: only subset of declared tasks mapped in `taskHandlers.ts` + `TaskTriggerSchema`.
- **Verdict**: **Partially true**.

## Declared Claim: Integration Tests Validate Runtime Controls

- **Claim source**: integration test naming and narrative.
- **Runtime evidence**: tests use fixtures/mocks and simulated control checks.
- **Verdict**: **Not runtime-proof; mostly behavioral simulation**.

## Declared Claim: Orchestrator Is Sole Dispatch Authority

- **Claim source**: architecture intent.
- **Runtime evidence**: standalone systemd units for `doc-specialist` and `reddit-helper` exist.
- **Verdict**: **Not strictly enforced operationally**.
