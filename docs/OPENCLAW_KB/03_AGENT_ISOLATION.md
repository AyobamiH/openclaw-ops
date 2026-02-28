# Agent Isolation and Dispatch Boundaries

Last updated: 2026-02-24

## Verified Isolation Facts

- Agents are primarily run as short-lived child processes through orchestrator task handlers.
- Child execution receives payload path and result-file env var only.
- Agent configs define permission intent (`permissions.skills`, network flags, constraints).

## Verified Weaknesses

1. Runtime permission enforcement is mostly inside agent code (`canUseSkill` checks), not centrally enforced by orchestrator.
2. Some agents (`doc-specialist`, `reddit-helper`) have long-running systemd services; these can execute outside queue governance.
3. Agent config schema is not uniformly enforced at load time; shape differs significantly between agents.

## Runtime Coverage Table

| Agent | Config has `orchestratorTask` | Handler wired | Trigger schema allows |
|---|---:|---:|---:|
| security-agent | yes | yes | yes |
| summarization-agent | yes | yes | yes |
| system-monitor-agent | yes | yes | yes |
| build-refactor-agent | yes | yes | yes |
| content-agent | yes | yes | yes |
| integration-agent | yes | yes | yes |
| normalization-agent | yes | yes | yes |
| doc-specialist | yes | yes (`drift-repair`) | yes |
| reddit-helper | yes | yes (`reddit-response`) | yes |
| market-research-agent | yes | no | no |
| data-extraction-agent | yes | no | no |
| qa-verification-agent | yes | no | no |
| skill-audit-agent | no | no | no |

## Governance Requirements

- Canonical route: orchestrator queue only.
- Explicitly classify standalone services as `debug/exception` or migrate behind orchestrator task handlers.
- Add config linter to fail CI when `orchestratorTask` declarations are unmapped in handlers/schema.
- Enforce the spawned-agent hard-cutover execution contract (result-file + centralized handler interpretation; no backward compatibility): `docs/OPENCLAW_KB/operations/AGENT_EXECUTION_CONTRACT.md`.
