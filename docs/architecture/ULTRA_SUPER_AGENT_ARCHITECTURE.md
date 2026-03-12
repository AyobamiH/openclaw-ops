---
title: "Ultra Super Agent Architecture"
summary: "Concrete capability target for OpenClaw agents, agent by agent."
---

# Ultra Super Agent Architecture

This document defines the target capability model for OpenClaw agents when they
are treated as ultra super agents rather than thin task wrappers.

It is intentionally stricter than the current runtime.

The goal is not to describe every feature already implemented. The goal is to
define the level of intelligence, grounding, verification, and operational
accountability each agent should eventually reach.

## Why This Exists

Skills can easily look smarter than weak agents.

That happens when:

- tools are the real source of capability
- skills are the only reusable methods
- agents are only routing wrappers with shallow task logic

OpenClaw should not stop there.

The target architecture is:

- `tools` provide raw actions
- `skills` provide reusable methods
- `agents` provide role-specific reasoning over those skills
- `governance` constrains risk
- `memory` and `verification` turn execution into operationally reliable work

An ultra super agent is therefore not just “good at prompts.” It is:

- role-exact
- evidence-grounded
- memory-aware
- tool-selective
- self-verifying
- failure-aware
- bounded by policy
- auditable by operators

## Universal Capability Baseline

Every ultra super agent should eventually support all of the following.

### 1. Role Intelligence

- Know its mission, scope, failure modes, and success criteria.
- Understand what belongs to it and what must be delegated.
- Refuse work that violates policy, capability bounds, or trust boundaries.

### 2. Skill Intelligence

- Know which skills exist and when to use them.
- Understand tradeoffs between skills: accuracy, latency, cost, risk, and
  observability.
- Chain multiple skills intentionally instead of one-shot guessing.

### 3. Tool Intelligence

- Distinguish safe local tools from risky external or mutating tools.
- Know when a tool is evidence-producing versus merely informative.
- Know when a tool result is weak and requires verification.

### 4. Planning Intelligence

- Break work into stages.
- Re-plan after partial failures.
- Surface blockers instead of pretending the work is done.

### 5. Verification Intelligence

- Check whether output matches task intent.
- Validate against tests, contracts, docs, or runtime evidence where relevant.
- Emit confidence with reasons, not a naked number.

### 6. Memory Intelligence

- Use short-term run context and longer-term operational memory.
- Distinguish fresh truth from stale prior belief.
- Record durable lessons for future runs.

### 7. Evidence Intelligence

- Distinguish:
  - code truth
  - config truth
  - runtime truth
  - public proof
  - inference
- Cite evidence paths or sources for important claims.

### 8. Recovery Intelligence

- Retry appropriately.
- Fall back safely.
- Escalate when recovery is not justified.
- Explain why the workflow stopped.

## Platform Requirements

Ultra super agents are not possible without matching platform support.

OpenClaw must provide:

- strong knowledge indexing with provenance and freshness
- task/run workflow state and replay events
- trust-layer APIs: claimed, configured, observed, public
- approval and policy enforcement
- cost/rate/budget controls
- audit trails
- incident and remediation state
- per-agent memory surfaces
- topology and dependency visibility

Without this platform layer, agent intelligence collapses back into prompt
cleverness and tool invocation noise.

## Current Runtime Progress

The runtime has not reached the ultra target yet, but the current code now has
real movement in that direction.

- `doc-specialist` now includes runtime truth in its generated knowledge packs,
  including task execution summaries, incident counts, proof transport posture,
  and observed relationship counts.
- `system-monitor-agent` now reads real orchestrator runtime state and per-agent
  service-state files instead of generating synthetic health summaries.
- `security-agent` now performs bounded repo/runtime checks for wildcard CORS,
  committed secret-like literals, default-secret fallbacks, and incident-driven
  service-runtime risk.
- `integration-agent` now validates workflow dependencies against real agent
  manifests, allowed skills, and dependency order instead of simulating success.
- `qa-verification-agent` now returns verification output with runtime incident,
  repair, workflow, and relationship evidence instead of reporting only test
  runner results.
- The orchestrator now persists runtime relationship observations for
  `dispatches-task`, `routes-to-agent`, `uses-skill`, `publishes-proof`,
  `feeds-agent`, `verifies-agent`, `monitors-agent`, `audits-agent`, and
  `coordinates-agent`.
- Incident remediation is now tracked across assignment, execution,
  verification, blocking, and resolution in the persistent incident ledger.

## Agent Capability Targets

### doc-specialist

**Role**

- Repository intelligence engine
- Truth spine for the rest of the system

**Current Strength**

- Strongest current foundation for repo/doc understanding and knowledge pack
  generation

**Ultra Target**

- Build task-specific knowledge packs, not generic summaries
- Detect drift between:
  - code
  - config
  - docs
  - runtime state
  - public proof
- Extract workflows, trust boundaries, route contracts, env dependencies, and
  service topology
- Produce contradiction reports with ranked severity
- Draft documentation repairs from code truth
- Generate incident packs for downstream agents and operators

**Key Inputs**

- `openclaw-docs/`
- `openai-cookbook/`
- repo source/config/runtime state
- knowledge base diagnostics

**Key Outputs**

- knowledge packs
- drift findings
- contradiction signals
- doc repair drafts
- incident context packs

### integration-agent

**Role**

- Execution spine
- Workflow conductor

**Current Strength**

- Present, but not yet the full conductor for multi-agent workflows

**Ultra Target**

- Break work into stages with explicit dependencies
- Choose which agents and skills should participate
- Re-route after partial failure
- Track why a workflow is blocked
- Preserve partial completion and resume paths
- Emit workflow graph events instead of flat completion messages

**Key Inputs**

- task intent
- agent capability registry
- workflow history
- incident/remediation model

**Key Outputs**

- step plan
- delegated tasks
- workflow state graph
- fallback and escalation decisions

### system-monitor-agent

**Role**

- Live nervous system
- Operational fusion layer

**Current Strength**

- Some surface area exists, but much is still placeholder-weighted

**Ultra Target**

- Fuse:
  - queue state
  - service state
  - repair state
  - retry backlog
  - proof freshness
  - budget posture
  - dependency health
- Detect emerging failure before operators do
- Convert telemetry into actionable diagnoses
- Feed incident generation and prioritization

### security-agent

**Role**

- Trust-boundary auditor
- Risk spine alongside monitoring and QA

**Current Strength**

- Exists, but still needs deeper repo/runtime grounding

**Ultra Target**

- Detect:
  - auth gaps
  - secret exposure
  - unsafe defaults
  - weak route boundaries
  - tool permission drift
  - trust-boundary regressions
- Rank risk by exploitability and blast radius
- Recommend bounded fixes with evidence and rollback concerns

### qa-verification-agent

**Role**

- Final verifier
- Acceptance gate for generated work

**Current Strength**

- Good foundation for bounded verification

**Ultra Target**

- Verify code changes, docs, replies, and workflow outcomes
- Score:
  - correctness
  - reproducibility
  - regression risk
  - policy fit
  - evidence quality
- Reject weak or unverifiable outputs
- Feed verification traces back into task/run history

### reddit-helper

**Role**

- Communication spine for public/community interaction

**Current Strength**

- One of the stronger real agent paths today

**Ultra Target**

- Detect recurring confusion in the community
- Turn that confusion into:
  - FAQ candidates
  - doc gap signals
  - proof-worthy public milestones
- Draft grounded replies from current knowledge packs and runtime truth
- Distinguish between safe public explanation and internal-only truth

### content-agent

**Role**

- Evidence-based publisher

**Current Strength**

- Present but not yet the primary publishing surface for repo-derived truth

**Ultra Target**

- Draft:
  - README sections
  - release notes
  - operator notices
  - migration guides
  - public proof-facing summaries
- Always anchor output to repo/runtime evidence
- Refuse to publish speculative claims as facts

### summarization-agent

**Role**

- Compression layer for long context

**Current Strength**

- Present, but should become a general operational summarizer

**Ultra Target**

- Compress:
  - logs
  - incidents
  - audits
  - task history
  - knowledge packs
- Preserve decision-critical facts while cutting noise
- Support multiple summary modes:
  - operator
  - agent handoff
  - public proof
  - incident replay

### data-extraction-agent

**Role**

- External artifact ingestion boundary

**Current Strength**

- Present, but should become the gateway for messy external inputs

**Ultra Target**

- Parse PDFs, HTML, feeds, CSVs, and heterogeneous artifacts
- Extract structured evidence
- Preserve provenance and source confidence
- Hand clean artifacts to normalization and doc-specialist

### normalization-agent

**Role**

- Canonicalization layer for extracted data

**Current Strength**

- Present, but should be treated as a core evidence-preparation agent

**Ultra Target**

- Normalize schemas, types, references, identifiers, and duplicates
- Produce stable, comparable representations for downstream reasoning
- Mark uncertainty or schema mismatch instead of silently coercing truth

### build-refactor-agent

**Role**

- Governed code surgeon

**Current Strength**

- One of the clearer practical worker paths

**Ultra Target**

- Produce bounded, reviewable patches
- Understand impacted files, tests, and rollback risks
- Use patch/test/verification loops instead of one-shot edits
- Refuse unsafe refactors when confidence is low or coverage is weak

### market-research-agent

**Role**

- External signal intake

**Current Strength**

- Practical path exists, but still partially dependency-sensitive

**Ultra Target**

- Track vendor, API, pricing, policy, and ecosystem changes
- Turn raw external research into internal operational knowledge
- Feed doc-specialist and integration-agent with change intelligence

### skill-audit-agent

**Role**

- Skill trust and intake validator

**Current Strength**

- Already aligns closely with governance needs

**Ultra Target**

- Validate new or changed skills for:
  - correctness
  - provenance
  - trust status
  - restart safety
  - metadata-only behavior
- Feed policy and telemetry surfaces used by operators

## System-Level Spine Model

This is the intended high-level shape once the agent layer matures.

- `doc-specialist` = truth spine
- `system-monitor-agent` + `security-agent` + `qa-verification-agent` = trust spine
- `integration-agent` = execution spine
- `reddit-helper` + `content-agent` + `summarization-agent` = communication spine
- `data-extraction-agent` + `normalization-agent` = ingestion boundary

## Capability Matrix

| Agent | Planning | Verification | Memory | External I/O | Governance Sensitivity | Current Maturity |
| --- | --- | --- | --- | --- | --- | --- |
| doc-specialist | High | High | High | Medium | High | Strong |
| integration-agent | Very High | Medium | High | Medium | High | Partial |
| system-monitor-agent | High | High | High | Low | High | Partial |
| security-agent | High | Very High | High | Medium | Very High | Partial |
| qa-verification-agent | Medium | Very High | Medium | Low | Very High | Strong |
| reddit-helper | Medium | Medium | High | High | High | Strong |
| content-agent | Medium | High | Medium | Medium | Medium | Partial |
| summarization-agent | Medium | Medium | Medium | Low | Medium | Partial |
| data-extraction-agent | Medium | Medium | Low | High | Medium | Partial |
| normalization-agent | Medium | High | Low | Medium | Medium | Partial |
| build-refactor-agent | High | Very High | Medium | Low | Very High | Strong |
| market-research-agent | Medium | Medium | Medium | Very High | Medium | Partial |
| skill-audit-agent | Medium | Very High | Medium | Low | Very High | Strong |

## Phased Rollout

### Phase 1: Stop Thin-Wrapper Behavior

- Make every agent explicitly aware of:
  - role
  - available skills
  - failure boundaries
  - verification requirements

### Phase 2: Strengthen the Platform

- agent topology
- truth layers
- incident/remediation model
- richer workflow events
- knowledge provenance/freshness/contradictions

### Phase 3: Upgrade Agent Cognition

- planning
- skill selection
- fallback logic
- verification loops
- durable memory usage

### Phase 4: Make the UI Reflect the Real Agent Model

- topology view
- incident cockpit
- truth rails
- workflow graph
- trust-boundary overlays

## Non-Goals

This architecture does **not** assume:

- unconstrained autonomous execution
- removal of approvals or policy controls
- free-form self-modification without audit
- “general intelligence” detached from role and evidence

The target is disciplined operational intelligence, not theatrical autonomy.
