# Approval Gates

Last updated: 2026-02-24

## Must Require Approval
- New skills or skill capability expansion
- Gateway allowlist/policy changes
- Deployment actions and agent-deploy mutations
- Destructive filesystem operations
- External transaction-like operations

## Current Implementation Assessment
- Approval metrics exist, but universal runtime approval gate is not fully enforced.
- Some task flows imply review intent (`requiresReview`, `dryRunRequired`) but remain declarative.

## Enforcement Target
- Every guarded action must call a central `approvalRequired(action, context)` check.
- Denied or missing approvals must hard-fail and emit audit violation log.
