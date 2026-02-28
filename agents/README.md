# OpenClaw Agent Catalog

This directory contains the specialized worker agents the orchestrator can
dispatch or evolve toward. Some are richer, runtime-oriented agent surfaces
(`doc-specialist`, `reddit-helper`); others are structured task templates that
define scope, I/O, and governance for future or selective execution paths.

Telemetry helpers live under [`shared/`](./shared). New agents should start from
[`AGENT_TEMPLATE/`](./AGENT_TEMPLATE).

## Current Agent Surfaces

- [`doc-specialist/`](./doc-specialist) - documentation drift repair and
  knowledge-pack generation
- [`reddit-helper/`](./reddit-helper) - community response drafting using fresh
  knowledge packs
- [`build-refactor-agent/`](./build-refactor-agent) - safe refactor and
  build-oriented code changes
- [`content-agent/`](./content-agent) - repository-backed content generation
- [`data-extraction-agent/`](./data-extraction-agent) - structured extraction
  from local files
- [`integration-agent/`](./integration-agent) - multi-step workflow handoffs
- [`market-research-agent/`](./market-research-agent) - approved external
  research collection
- [`normalization-agent/`](./normalization-agent) - data normalization
- [`qa-verification-agent/`](./qa-verification-agent) - verification and QA
  evidence
- [`security-agent/`](./security-agent) - security review and remediation
  guidance
- [`skill-audit-agent/`](./skill-audit-agent) - skill reliability and behavior
  audits
- [`summarization-agent/`](./summarization-agent) - long-form summarization
- [`system-monitor-agent/`](./system-monitor-agent) - health and observability
  reporting

## How To Read This Directory

- `agents/README.md` is the catalog and current entrypoint.
- Each `agents/*/README.md` is a specialized local runbook for that agent, using
  the same baseline structure (`Status`, `Primary orchestrator task`,
  `Canonical contract`, `Mission`, `Contract`, `Runtime`, `Governance`).
- `agent.config.json` and source code are the real contract when documentation
  and implementation differ.

Not every agent here is equally mature. The folder can contain both active
runtime surfaces and staged templates for orchestrated expansion.

## Memory Contract (Mandatory for all agents)

Every agent must include these config keys in `agent.config.json`:

- `orchestratorStatePath`
- `serviceStatePath`

Why this remains mandatory:

- Enables persistent cross-run memory continuity.
- Guarantees each agent has a durable execution timeline and status history.
- Supports operator auditability and replay-friendly diagnostics.

Runtime standard:

- The orchestrator updates each spawned agent `serviceStatePath` with memory
  state (`lastRunAt`, `lastStatus`, task IDs/types, counters, and bounded
  timeline history).
- Agents with richer pipelines may define additional memory I/O keys (for
  example `knowledgePackDir`, `draftLogPath`, `devvitQueuePath`) but cannot
  omit the baseline memory contract above.

## Governance

Every agent folder should keep its local governance primitives (`ROLE.md`,
`SCOPE.md`, `POLICY.md`, `TOOLS.md`) aligned with
`../docs/GOVERNANCE_REPO_HYGIENE.md`.

Material agent code/config changes should update the appropriate existing `.md`
file in the same change set and reference the affected task, runtime, or config
paths where useful.
