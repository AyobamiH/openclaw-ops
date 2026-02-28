# Skills Runtime and Supply Chain Governance

Last updated: 2026-02-24

## Verified Runtime Behavior

- Skills are implemented in `skills/*.ts` and invoked by agent code via `executeSkill()` from `skills/index.ts`.
- `skills/index.ts` includes TODO-level notes for permission enforcement and references non-existent runtime modules.

## Critical Verified Gaps

- `skills/index.ts` dynamically imports `../orchestrator/src/skillAudit.js`, but no `orchestrator/src/skillAudit.ts` exists.
- Claimed runtime `toolGate` enforcement is not present in orchestrator runtime source tree.
- Skill permissions are metadata-rich but are not centrally enforced at skill execution entry point.

## Skill Risk Notes (From Implementation)

- `sourceFetch.ts`: allowlist is declared in definition metadata, but execution path does not enforce domain allowlist before `fetch(url)`.
- `documentParser.ts`: reads arbitrary `filePath` from input; no workspace root boundary check.
- `workspacePatch.ts`: writes arbitrary input path when `dryRun=false`; no root guard.
- `testRunner.ts`: uses `sh -c` with whitelisted strings, but still shell-based execution.

## Governance Actions

1. Introduce hard runtime gate in `executeSkill()` enforcing:
   - caller agent permission
   - path boundaries
   - network domain allowlist
   - command allowlist without `sh -c`.
2. Implement actual skill audit runtime module and fail startup if unavailable.
3. Add signed/hashed skill manifest and verify integrity at load.
