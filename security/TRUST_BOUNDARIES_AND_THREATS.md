# Trust Boundaries and Threat Model

## Trust Boundaries

1. External callers -> Orchestrator HTTP gateway
2. Orchestrator -> spawned agent process boundary
3. Agent -> skill execution boundary
4. Skill -> filesystem/network/exec capabilities
5. Runtime -> persistence/metrics backends

## Primary Threats

- Unauthorized API task trigger attempts.
- Webhook forgery / replay.
- Task-type confusion and unknown-task smuggling.
- Agent execution outside orchestrator policy path.
- Over-broad skill behavior (path/network/exec).
- Config drift between declared and enforced permissions.

## Existing Mitigations (Verified)

- Bearer auth + webhook signature validation.
- Zod validation and rate limiting.
- Required security env checks at startup.

## Missing/Weak Mitigations

- No central runtime skill gate.
- No guaranteed enforceable allowlist in skill implementations.
- No strict reject on unknown task enqueue path.

## High-Value Controls to Add

1. HMAC timestamp + nonce replay protection on webhooks.
2. Centralized allowlist checks for file/network/exec at skill runner entry.
3. Signed config manifest check at startup.
4. Mandatory mapping check for all declared `orchestratorTask` values.
