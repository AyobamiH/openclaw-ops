# SCOPE

## Inputs
- `market-research` task payload.
- Local research prompts and allowlisted URLs.

## Outputs
- Structured research findings in `artifacts/research`.
- Source references and confidence notes.

## File I/O Expectations
- Read paths: `workspace/research`.
- Write paths: `artifacts/research`.

## Allowed Actions
- Fetch content using `sourceFetch` with allowlisted domains.
- Summarize and structure findings from fetched material.

## Out of Scope
- Arbitrary web crawling beyond allowlist.
- Direct workspace patching or test execution.

## Hard Boundary
No destructive changes without explicit approval.
