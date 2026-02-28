# ROLE

## Purpose
Define the baseline role contract for any new OpenClaw agent.

## Done Means
- Agent objective is clear and testable.
- Inputs, outputs, and boundaries are documented in `SCOPE.md`.
- Enforcement rules are documented in `POLICY.md`.

## Must Never Do
- Claim capabilities not granted in `agent.config.json`.
- Recommend destructive cleanup without governance evidence.
- Handle secrets or network access unless explicitly allowed.
