import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortObjectKeys(entry));
  }

  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObjectKeys(source[key]);
        return acc;
      }, {});
  }

  return value;
}

export function canonicalizeJson(payload: unknown): string {
  return JSON.stringify(sortObjectKeys(payload));
}

export function computeWebhookSignature(payload: unknown, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(canonicalizeJson(payload))
    .digest('hex');
}

function normalizeWebhookSignature(signature: string): string {
  const trimmed = signature.trim().toLowerCase();
  return trimmed.startsWith('sha256=') ? trimmed.slice(7) : trimmed;
}

/**
 * API Key Management with Rotation Support
 */
interface ApiKeyConfig {
  key: string;
  version: number;
  createdAt: string;
  expiresAt: string;
  active: boolean;
}

interface KeyRotationState {
  keys: ApiKeyConfig[];
  lastRotationAt: string;
  rotationPolicy: {
    maxAge: number; // days
    gracePeriod: number; // days before expiration to warn
    requireActiveKey: boolean;
  };
}

// Parse API keys from environment (supports multiple keys for rotation)
// Format: API_KEY=<key1> or API_KEY_ROTATION=<JSON with version,expiry>
function loadApiKeys(): ApiKeyConfig[] {
  const keys: ApiKeyConfig[] = [];

  // Primary key from API_KEY env var (always current)
  const primaryKey = process.env.API_KEY;
  if (primaryKey) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90); // 90-day default expiration
    keys.push({
      key: primaryKey,
      version: 1,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      active: true,
    });
  }

  // Additional keys from rotation config (backward compat)
  const rotationConfig = process.env.API_KEY_ROTATION;
  if (rotationConfig) {
    try {
      const parsed = JSON.parse(rotationConfig) as ApiKeyConfig[];
      keys.push(...parsed);
    } catch (e) {
      console.warn('[AUTH] Failed to parse API_KEY_ROTATION config, ignoring');
    }
  }

  return keys;
}

/**
 * Check if key is expired
 */
function isKeyExpired(key: ApiKeyConfig): boolean {
  const expiry = new Date(key.expiresAt);
  return new Date() > expiry;
}

/**
 * Check if key is near expiration (within grace period)
 */
function isKeyExpiringSoon(key: ApiKeyConfig, graceDays = 14): boolean {
  const now = new Date();
  const expiry = new Date(key.expiresAt);
  const daysUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return daysUntilExpiry <= graceDays && daysUntilExpiry > 0;
}

/**
 * Verify security posture at startup
 */
export function verifyKeyRotationPolicy(): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const keys = loadApiKeys();

  if (keys.length === 0) {
    return {
      valid: false,
      warnings: ['No API keys configured - API will reject all requests'],
    };
  }

  // Check for expired keys
  keys.forEach(k => {
    if (isKeyExpired(k)) {
      warnings.push(`API key v${k.version} has expired (${k.expiresAt})`);
    }
    if (isKeyExpiringSoon(k)) {
      warnings.push(`API key v${k.version} expires soon (${k.expiresAt})`);
    }
  });

  // Check for at least one active, non-expired key
  const activeValid = keys.some(k => k.active && !isKeyExpired(k));
  if (!activeValid) {
    warnings.push('No valid active API key available - imminent auth failures');
    return { valid: false, warnings };
  }

  return { valid: true, warnings };
}

/**
 * Middleware: Require Bearer Token Authentication with Rotation Support
 * Used for sensitive API endpoints (persistence, knowledge base mutations)
 */
export function requireBearerToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const keys = loadApiKeys();

  if (keys.length === 0) {
    console.error('[AUTH] No API keys configured - refusing request');
    return res.status(500).json({ error: 'Server misconfigured: No API keys' });
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('[AUTH] Missing or invalid Authorization header');
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix

  // Check against all configured keys
  let keyMatch: ApiKeyConfig | null = null;
  for (const key of keys) {
    if (token === key.key) {
      keyMatch = key;
      break;
    }
  }

  if (!keyMatch) {
    console.warn('[AUTH] Invalid API key provided');
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }

  // Check if key is expired
  if (isKeyExpired(keyMatch)) {
    console.error(`[AUTH] Expired API key v${keyMatch.version} attempted - ${keyMatch.expiresAt}`);
    return res.status(401).json({ error: 'Unauthorized: API key expired' });
  }

  // Warn if key expiring soon
  if (isKeyExpiringSoon(keyMatch)) {
    console.warn(`[AUTH] API key v${keyMatch.version} expiring soon (${keyMatch.expiresAt})`);
    res.setHeader('X-API-Key-Expires', keyMatch.expiresAt);
  }

  // Valid token - proceed
  next();
}

/**
 * Middleware: Verify Webhook Signature (HMAC-SHA256)
 * Used for AlertManager webhook to prevent unauthorized alert injection
 */
export function verifyWebhookSignature(req: Request, res: Response, next: NextFunction) {
  const signature = req.headers['x-webhook-signature'] as string;
  const secret = process.env.WEBHOOK_SECRET;

  if (!secret) {
    console.error('[WEBHOOK] WEBHOOK_SECRET not configured - refusing request');
    return res.status(500).json({ error: 'Server misconfigured: WEBHOOK_SECRET missing' });
  }

  if (!signature) {
    console.warn('[WEBHOOK] Missing X-Webhook-Signature header');
    return res.status(401).json({ error: 'Unauthorized: Missing signature' });
  }

  const normalized = normalizeWebhookSignature(signature);
  const computed = computeWebhookSignature(req.body, secret);

  const providedBuffer = Buffer.from(normalized, 'hex');
  const computedBuffer = Buffer.from(computed, 'hex');

  const hasInvalidEncoding =
    normalized.length !== computed.length ||
    providedBuffer.length !== computedBuffer.length;

  if (hasInvalidEncoding || !crypto.timingSafeEqual(providedBuffer, computedBuffer)) {
    console.warn('[WEBHOOK] Invalid signature - possible tampering or wrong shared secret');
    return res.status(401).json({ error: 'Unauthorized: Invalid signature' });
  }

  // Valid signature - proceed
  next();
}

/**
 * Middleware: Log security events
 * Tracks authentication attempts for audit trail
 */
export function logSecurityEvent(req: Request, res: Response, next: NextFunction) {
  const originalSend = res.send;

  res.send = function (data: any) {
    if (res.statusCode >= 400) {
      console.warn('[SECURITY] Event', {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        clientIP: req.ip,
        userAgent: req.get('user-agent'),
      });
    }
    res.send = originalSend;
    return res.send(data);
  };

  next();
}
