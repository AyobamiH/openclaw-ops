# Security And Trust Boundaries

## Source Integrity

Every source file must preserve:

- checksum
- ingest actor
- ingest timestamp
- storage identity
- version lineage

## Evidence Tampering Risk

The system must assume that trust can be undermined if:

- citations drift after reprocessing
- source files are silently replaced
- derived objects lose their lineage

## Unsafe Inference Risk

The model layer must never be allowed to flatten:

- uncertain entity matches
- weak causal claims
- disputed interpretations

into authoritative facts without review.

## Review Gates

Human or policy review must sit between extraction and publication for sensitive
outputs.

## Admin Controls

Administrative actions should be audited for:

- source deletion
- source replacement
- publication changes
- review overrides

## Prompt / Model Misuse

Models may assist extraction, but they must not be treated as an authority
source. Every published output still depends on evidence and review.
