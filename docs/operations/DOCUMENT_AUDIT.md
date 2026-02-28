# Documentation Audit

Status: Active audit snapshot
Last updated: 2026-02-28
Scope: First-party OpenClaw workspace docs only

## Scope Rules

This audit covers the first-party documentation used to operate and publish this
workspace:

- root workspace Markdown files
- `docs/` content
- selected subproject docs that affect operator truth

This audit does not treat these trees as primary docs for freshness decisions:

- `openclaw-docs/` (mirrored upstream docs)
- `openai-cookbook/` (mirrored upstream docs)
- agent persona files (`agents/*/{SOUL,IDENTITY,USER,TOOLS,...}.md`) unless a
  runtime contract depends on them

Those files may still be needed, but they are not the canonical workspace
operations surface.

## Canonical Docs To Keep Current

These are the documents operators and contributors should treat as active truth:

| Path | Role | Why it stays canonical |
|---|---|---|
| `README.md` | public repo entry | top-level navigation and runtime overview |
| `QUICKSTART.md` | fast-start path | shortest supported local start flow |
| `DEPLOYMENT.md` | deployment surface | root deployment entrypoint |
| `OPENCLAW_CONTEXT_ANCHOR.md` | runtime orientation | canonical repo/runtime truth map |
| `docs/README.md` | docs hub | docs entrypoint |
| `docs/INDEX.md` | docs index | authoritative file map |
| `docs/NAVIGATION.md` | by-role navigation | fast path for operators, contributors, maintainers |
| `docs/SUMMARY.md` | docs status summary | inventory and current status |
| `orchestrator/README.md` | subproject entrypoint | current control-plane orientation for this package |
| `openclawdbot/README.md` | subproject entrypoint | current Reddit app orientation for this package |
| `agents/README.md` | subproject entrypoint | current catalog for the agent surface |
| `docs/OPERATOR_GUIDE.md` | day-2 ops | runtime behavior and operating expectations |
| `docs/operations/SPRINT_TO_COMPLETION.md` | active closure plan | current unfinished work tracker |
| `docs/CLAWDBOT_MILESTONES.md` | milestone policy | emission rules and guardrails |
| `docs/operations/MILESTONE_INGEST_CONTRACT.md` | interface contract | active ingest/feed protocol |
| `docs/operations/MILESTONE_PIPELINE_RUNBOOK.md` | on-call runbook | operator steps for milestone pipeline |
| `docs/operations/clawdbot-milestone-delivery-plan.md` | implementation map | code-to-doc milestone pipeline mapping |

## Current Technical References To Keep

These remain useful and should stay, but they are secondary to code/config:

| Path | Status | Notes |
|---|---|---|
| `docs/concepts/architecture.md` | keep | current high-level technical explanation |
| `docs/guides/configuration.md` | keep | must match `orchestrator_config.json` |
| `docs/guides/running-agents.md` | keep | active operator/developer guide |
| `docs/guides/monitoring.md` | keep | current operational reference |
| `docs/guides/adding-tasks.md` | keep | active extension guide |
| `docs/reference/api.md` | keep | interface reference; code still wins on conflict |
| `docs/reference/task-types.md` | keep | task allowlist reference |
| `docs/reference/state-schema.md` | keep | state shape summary; code is canonical |
| `docs/GOVERNANCE_REPO_HYGIENE.md` | keep | primary policy authority |
| `docs/OPENCLAW_KB/README.md` | keep | classification entrypoint for the KB reference set |
| `docs/OPENCLAW_KB/CLASSIFICATION.md` | keep | per-file current vs historical vs generated register |
| `docs/OPENCLAW_KB/**` | keep | secondary knowledge-pack corpus; verify against code before relying on details |
| `agents/*/README.md` | keep | agent-specific runbooks; subordinate to code and `agent.config.json` |

## Historical Docs To Keep But Demote

These should remain in the repo as historical records, but they should not be
used as active truth:

| Path | Why keep it | Why it is not canonical |
|---|---|---|
| `DOCUMENTATION_COMPLETE.md` | records a past docs build-out milestone | claims completion while docs continued to evolve |
| `IMPLEMENTATION_COMPLETE.md` | records a past delivery milestone | scope is narrow and no longer reflects full runtime state |
| `orchestrator_documentation.md` | legacy summary of older orchestrator docs | duplicated and drifted from `docs/` |
| `orchestrator_status.md` | dated operational snapshot | tied to 2026-02-19 assumptions |
| `orchestrator_workflow_plan.md` | original workflow planning note | largely superseded by current sprint and code |
| `orchestrator/PHASE_2_COMPLETION.md` | phase evidence | phase snapshot only |
| `orchestrator/PHASE_3_COMPLETION.md` | phase evidence | phase snapshot only |

## Stale Issues Found In This Audit

### Resolved in this change set

1. `docs/INDEX.md`, `docs/NAVIGATION.md`, `docs/README.md`, and
   `docs/SUMMARY.md` pointed to multiple files that do not exist.
2. `docs/reference/state-schema.md` described the wrong state file path and an
   outdated schema.
3. `docs/reference/task-types.md` described only 8 task types, while the code
   allowlist is larger.
4. `docs/guides/configuration.md` referenced a nonexistent configuration
   reference file and used stale path examples.
5. `docs/CLAWDBOT_MILESTONES.md`,
   `docs/operations/clawdbot-milestone-delivery-plan.md`, and
   `docs/operations/MILESTONE_INGEST_CONTRACT.md` still described milestone
   delivery as partially unimplemented even though the code now has:
   - orchestrator emitter and delivery retries
   - app ingest route
   - app feed route
   - idempotency and rejection handling
6. `DOCUMENTATION_COMPLETE.md`, `IMPLEMENTATION_COMPLETE.md`,
   `orchestrator_documentation.md`, `orchestrator_status.md`, and
   `orchestrator_workflow_plan.md` were easy to mistake for active truth.
7. `openclawdbot/README.md` was still the stock Devvit starter and did not
   describe the actual milestone app.
8. `agents/README.md` listed only two agents even though the directory now holds
   a broader agent catalog.
9. `docs/OPENCLAW_KB/README.md` did not clearly state that the KB set is a
   secondary synthesized reference layer rather than the primary runtime
   contract.
10. The individual `agents/*/README.md` files were inconsistent in structure and
    made cross-agent comparison harder than necessary.
11. `docs/OPENCLAW_KB/**` had no per-file status register, so current,
    historical, and generated content was mixed without a clear boundary.
12. Several KB core snapshots had become stale after task allowlisting,
    ToolGate, and SkillAudit moved from planned to implemented.
13. The KB generated layer had unnecessary overlap across architecture,
    control-plane, gateway, lifecycle, and skills summaries.

### Still intentionally not audited in depth

1. some current KB files remain concise snapshots rather than exhaustive
   deep-dive documentation:
   they are current, but intentionally not expanded into full runbooks.
2. agent persona/identity docs:
   these are behavioral and descriptive, not primary runtime contracts.
3. per-agent README depth:
   the agent README layer is now normalized structurally, but not every agent
   has the same implementation maturity behind that shared format.
4. mirrored upstream docs:
   first-party freshness rules do not apply to imported mirrors.

## Retire vs Keep Rules

### Keep

Keep a document if it does at least one of these:

- it is a current operator entrypoint
- it documents an active interface or contract
- it preserves historical evidence that still has audit value

### Demote

Demote a document to historical when:

- it records a dated milestone or phase
- it claims completion but the repo has moved on
- it duplicates a newer canonical document

### Retire Candidate

A document becomes a retire candidate only when:

- it is not referenced by current navigation
- it adds no historical or audit value
- it is fully superseded by another file

No retire/delete action is taken in this audit. This pass only classifies and
demotes.

## Remaining Unfinished Work

This is the current work that still appears open after comparing docs to code:

1. Keep the KB classification register current as the runtime evolves so the KB
   does not drift back into mixed-status ambiguity.
2. Decide whether `docs/SYSTEM_DIAGRAM_PROMPT.md` should remain a prompt-only
   artifact or gain a generated diagram asset.
3. Continue repo-wide sprint closure from
   `docs/operations/SPRINT_TO_COMPLETION.md`, especially:
   - docs truth alignment
   - public GitHub experience hardening
   - final operational hardening checks
4. Platform-side Devvit review/publish remains outside source control. The app
   can be uploaded and submitted, but Reddit review still gates full publish.

## Verification Notes

This audit was based on:

- live code and config under `orchestrator/` and `openclawdbot/`
- current docs under `docs/`
- a first-party Markdown link check across root docs and `docs/`

Canonical precedence remains:

1. code and config
2. canonical docs listed above
3. historical snapshot docs
