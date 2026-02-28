# Agent Roles & Delegation Boundaries

Last updated: 2026-02-24

## Inventory (from `agents/*/agent.config.json`)
- build-refactor-agent
- content-agent
- data-extraction-agent
- doc-specialist
- integration-agent
- market-research-agent
- normalization-agent
- qa-verification-agent
- reddit-helper
- security-agent
- skill-audit-agent
- summarization-agent
- system-monitor-agent

## Role Intent vs Runtime Enforcement
### Intent (declared)
- Research: fetch/read focused
- Extraction/Normalization: transform structured outputs
- Builder: patch + tests with declared review/dry-run constraints
- QA: test-only scope
- Operations/System-monitor: runtime checks/alerts

### Verified runtime reality
- Agent declarations are loaded and queryable through `AgentRegistry`.
- Skill allow booleans can be queried (`canUseSkill`), but this alone is not a full runtime policy firewall.
- Several constraints in configs (`requiresReview`, `dryRunRequired`, `maxCalls`, `rateLimit`, file paths/domains) are **not globally enforced by a shared mandatory execution gate**.

## Delegation Boundary Findings
- **High**: Builder deploy restrictions and reviewer gates are mostly declarative, not uniformly enforced.
- **High**: QA non-mutation and Research non-mutation boundaries are not guaranteed by a single hard policy executor.
- **Medium**: Schema differences across agent configs increase policy parsing drift risk.

## Required Hardening
- Normalize agent config schema version + strict validation.
- Enforce all role boundaries at skill invocation gateway (not handler-local conventions).
- Deny execution if role policy cannot be evaluated deterministically.
