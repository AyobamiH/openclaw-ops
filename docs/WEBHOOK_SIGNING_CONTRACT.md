---
title: "Webhook Signing Contract"
summary: "Canonical HMAC-SHA256 contract for /webhook/alerts requests"
read_when:
  - Integrating AlertManager with orchestrator
  - Debugging signature mismatch errors
---

# Webhook Signing Contract

This contract defines how upstream systems (including AlertManager relays) must compute
`X-Webhook-Signature` for `POST /webhook/alerts`.

## Algorithm

- Header: `X-Webhook-Signature`
- Algorithm: `HMAC-SHA256`
- Secret: shared value from `WEBHOOK_SECRET`
- Digest encoding: lowercase hexadecimal

## Canonicalization Rules

Before signing JSON payloads:

1. Recursively sort all object keys lexicographically.
2. Preserve array order as-is.
3. Keep primitive values unchanged (`string`, `number`, `boolean`, `null`).
4. Serialize with standard JSON (no extra whitespace requirements).

This ensures signatures remain stable even when key ordering differs between producers.

## Node.js Example

```js
import crypto from 'node:crypto';

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeys(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function signPayload(payload, secret) {
  const canonical = JSON.stringify(sortKeys(payload));
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}
```

## Compatibility Notes

- The orchestrator accepts either:
  - raw hex digest (`abc123...`), or
  - prefixed format (`sha256=abc123...`).
- Any non-canonical signing implementation can intermittently fail when JSON key order changes.

## Validation Expectations

- Missing signature header → `401 Unauthorized`
- Invalid signature → `401 Unauthorized`
- Valid canonical signature → request proceeds to schema validation and alert handling
