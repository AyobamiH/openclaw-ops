# Drift Prevention

Last updated: 2026-02-24

## High-Probability Drift Vectors
1. Undocumented direct agent execution paths.
2. Agent config schema divergence.
3. Policy declarations not reflected in runtime enforcement.
4. Test suites labeling simulations as integration.

## Preventive Controls
- Governance CI checks:
  - block merge if new task type is not in allowlist + schema + test
  - block merge if agent config schema invalid
  - block merge if tool invocation path bypasses central policy gateway
- Require architecture decision record for routing/policy changes.
- Regenerate this KB on each release and compare invariant compliance diff.

## Severity-Ranked Drift Findings
- Critical: orchestrator non-exclusivity in execution mode.
- High: partial enforcement of declared agent constraints.
- Medium: mission chain bound/approval gate incompleteness.
