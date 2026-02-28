# Recovery Procedures

Last updated: 2026-02-24

## Immediate Containment
1. Stop direct agent services not orchestrator-mediated.
2. Keep orchestrator as single active control entry point.
3. Rotate API keys if auth exposure suspected.
4. Validate webhook secret and signature behavior.

## Integrity Recovery
1. Snapshot current state/log artifacts.
2. Reconcile taskHistory with external logs.
3. Rebuild known-good state from last verified checkpoint.

## Policy Recovery
1. Re-run governance integration tests.
2. Re-verify invariants in SYSTEM_INVARIANTS.
3. Block deployment until critical/high findings are remediated.
