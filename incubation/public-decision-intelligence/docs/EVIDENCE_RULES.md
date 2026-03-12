# Evidence Rules

## Evidence Classes

### Direct

Use `direct` when the source explicitly supports the claim or relationship.

Examples:

- an email states a recommendation was made
- a committee record lists a meeting
- an appointment letter confirms a role

### Inferred

Use `inferred` when the system links facts that are plausible and evidence-based
but not explicitly stated together in one source.

Inference must preserve:

- supporting citations
- reasoning basis
- confidence

### Disputed

Use `disputed` when evidence conflicts or credible review has challenged the
current interpretation.

Disputed objects must not be silently published as settled truth.

### Incomplete

Use `incomplete` when evidence is suggestive but insufficient to support a firm
claim or relationship.

## Claim Sufficiency Rules

A claim is not publishable unless:

- at least one stable citation exists
- the evidence class is explicit
- review state is compatible with publication
- contradictory evidence, if known, is linked or noted

## Publication Rules

The system must refuse to overstate when:

- citations are missing
- evidence is only incomplete
- entity resolution is too uncertain
- the claim depends on a causal leap with weak support

## Citation Requirements

Every meaningful claim, relationship, or decision-chain step must include:

- source document identity
- stable citation anchor
- source excerpt

## Review States

Derived objects should move through:

- `extracted`
- `normalized`
- `linked`
- `under_review`
- `verified`
- `challenged`
- `rejected`
- `published`

The system may automate extraction, but it must not automate certainty.
