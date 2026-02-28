/**
 * Gap 7: API Key Rotation Test Suite
 * Tests multi-key rotation framework with expiration checking
 */

import { afterEach, describe, expect, it } from 'vitest';
import { verifyKeyRotationPolicy } from '../src/middleware/auth.js';

const originalApiKey = process.env.API_KEY;
const originalApiKeyRotation = process.env.API_KEY_ROTATION;

afterEach(() => {
  if (typeof originalApiKey === 'undefined') {
    delete process.env.API_KEY;
  } else {
    process.env.API_KEY = originalApiKey;
  }

  if (typeof originalApiKeyRotation === 'undefined') {
    delete process.env.API_KEY_ROTATION;
  } else {
    process.env.API_KEY_ROTATION = originalApiKeyRotation;
  }
});

describe('Gap 7: API Key Rotation', () => {
  it('accepts valid single key config', () => {
    process.env.API_KEY = 'valid-test-key-2026';
    delete process.env.API_KEY_ROTATION;

    const result = verifyKeyRotationPolicy();

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('rejects when no keys are configured', () => {
    delete process.env.API_KEY;
    delete process.env.API_KEY_ROTATION;

    const result = verifyKeyRotationPolicy();

    expect(result.valid).toBe(false);
    expect(result.warnings[0]).toContain('No API keys configured');
  });

  it('accepts current key during rotation while warning on expired old key', () => {
    process.env.API_KEY = 'current-key-2026';
    const now = new Date();
    process.env.API_KEY_ROTATION = JSON.stringify([
      {
        key: 'old-key-v1',
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        expiresAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        active: false,
      },
    ]);

    const result = verifyKeyRotationPolicy();

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('expired'))).toBe(true);
  });

  it('warns when active key is expiring soon', () => {
    delete process.env.API_KEY;
    const now = new Date();
    process.env.API_KEY_ROTATION = JSON.stringify([
      {
        key: 'current-key-expiring-soon',
        version: 1,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        active: true,
      },
    ]);

    const result = verifyKeyRotationPolicy();

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('expires soon'))).toBe(true);
  });

  it('rejects when all configured keys are expired', () => {
    delete process.env.API_KEY;
    const now = new Date();
    process.env.API_KEY_ROTATION = JSON.stringify([
      {
        key: 'old-key',
        version: 1,
        createdAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        active: true,
      },
    ]);

    const result = verifyKeyRotationPolicy();

    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes('No valid active API key'))).toBe(true);
  });
});
