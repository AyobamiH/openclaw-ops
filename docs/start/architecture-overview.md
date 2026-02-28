---
title: "Architecture Overview"
summary: "Non-technical explanation of how the system works."
read_when:
  - Explaining to stakeholders
  - Understanding the big picture
  - Planning integrations
---

# Architecture Overview

This is the non-technical version of the OpenClaw workspace. For developers,
use [System Architecture](../concepts/architecture.md).

## The Big Picture

Think of OpenClaw as a control center for autonomous AI work:

1. The orchestrator decides what should happen.
2. Specialized agents do focused work.
3. The local knowledge sources keep those agents grounded in repo truth.

The orchestrator is the active control plane. It watches for changes, accepts
tasks, schedules recurring work, records outcomes, and emits milestones for
operator-visible events.

## The Three Main Parts

### 1. The Orchestrator

This is the coordinating brain:

- receives tasks
- validates task types
- routes work to handlers or agents
- records results and state
- keeps the runtime moving on a schedule

The practical analogy is dispatch: it does not perform every specialized job
itself, but it decides what happens next and keeps the history coherent.

### 2. The Agents

Agents are specialist workers.

Examples:

- `doc-specialist`: repairs documentation drift and produces knowledge packs
- `reddit-helper`: drafts community responses using current knowledge
- task-specific agents: security, QA, summarization, normalization, and other
  focused execution paths

### 3. The Knowledge Surface

The system uses local documentation and runtime artifacts as reference material:

- first-party docs under `docs/`
- local mirrors such as `openclaw-docs/` and `openai-cookbook/`
- logs, state, and generated artifacts

This keeps the system grounded in concrete evidence instead of ad hoc memory.

## How The Parts Work Together

Typical flow:

1. A task enters from API, scheduler, watcher, or internal logic.
2. The orchestrator validates and queues the work.
3. A handler runs inline or spawns the right agent.
4. The result is recorded in state and logs.
5. Downstream surfaces, including milestones, can reflect that change.

## Why This Matters

This design gives you:

- specialization without losing central control
- traceability for what ran and why
- a system that can keep learning from updated docs and runtime outputs
- clear operational visibility through logs, state, and milestone feeds

## Reading Path

If you need deeper detail after this overview:

1. [System Architecture](../concepts/architecture.md)
2. [Operator Guide](../OPERATOR_GUIDE.md)
3. [Task Types](../reference/task-types.md)
4. [State Schema](../reference/state-schema.md)

Repository hygiene and cleanup decisions for drift-repair/indexing paths must
follow `docs/GOVERNANCE_REPO_HYGIENE.md`.
