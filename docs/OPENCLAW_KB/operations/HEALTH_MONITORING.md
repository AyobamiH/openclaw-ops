# Health Monitoring

Last updated: 2026-02-24

## Implemented Signals
- `/health` endpoint
- Prometheus metrics endpoint
- Task failure threshold tracker with alert manager integration
- Heartbeat enqueue loop + missed heartbeat detector

## Gaps
- Agent liveness is tracked in registry structures but not fully coupled to mission SLA enforcement.
- No single dashboard-level invariant checker that blocks unsafe operation modes.

## Recommendations
- Add control-plane compliance health endpoint exposing invariant pass/fail.
- Add stuck mission detector based on task age + retry depth.
