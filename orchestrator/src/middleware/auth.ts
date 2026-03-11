import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export type AuthRole = 'viewer' | 'operator' | 'admin';

const ROLE_RANK: Record<AuthRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
};

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

function safeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
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
  label?: string;
  roles?: AuthRole[];
}

type AuthContext = {
  requestId: string;
  actor: string;
  role: AuthRole;
  roles: AuthRole[];
  apiKeyVersion: number;
  apiKeyLabel: string;
  apiKeyExpiresAt: string;
};

export type AuthenticatedRequest = Request & {
  auth?: AuthContext;
};

function parseAuthRole(value: unknown): AuthRole | null {
  if (value === 'viewer' || value === 'operator' || value === 'admin') {
    return value;
  }
  return null;
}

function normalizeRoles(roles: unknown, fallback: AuthRole[] = ['admin']): AuthRole[] {
  if (!Array.isArray(roles)) return fallback;
  const normalized = roles
    .map((role) => parseAuthRole(role))
    .filter((role): role is AuthRole => role !== null);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : fallback;
}

function resolveHighestRole(roles: AuthRole[]): AuthRole {
  return roles.reduce<AuthRole>((highest, current) => {
    if (ROLE_RANK[current] > ROLE_RANK[highest]) return current;
    return highest;
  }, 'viewer');
}

function hasRequiredRole(roles: AuthRole[], required: AuthRole): boolean {
  const highest = resolveHighestRole(roles);
  return ROLE_RANK[highest] >= ROLE_RANK[required];
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

  const now = new Date();
  const nowIso = now.toISOString();
  const defaultExpiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const normalizeIsoTimestamp = (value: unknown, fallback: string): string => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value).toISOString();
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return fallback;
  };

  // Additional keys from rotation config (preferred)
  const rotationConfig = process.env.API_KEY_ROTATION;
  if (rotationConfig) {
    try {
      const parsed = JSON.parse(rotationConfig) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error('API_KEY_ROTATION must be a JSON array');
      }
      for (let index = 0; index < parsed.length; index += 1) {
        const entry = parsed[index] as Record<string, unknown>;
        const key = typeof entry.key === 'string' ? entry.key.trim() : '';
        if (!key) {
          console.warn(`[AUTH] Skipping API_KEY_ROTATION entry ${index}: missing key`);
          continue;
        }
        const version =
          typeof entry.version === 'number' && Number.isFinite(entry.version)
            ? Math.floor(entry.version)
            : index + 1;
        const createdAt = normalizeIsoTimestamp(entry.createdAt, nowIso);
        const expiresAt = normalizeIsoTimestamp(entry.expiresAt, defaultExpiresAt);
        keys.push({
          key,
          version: version > 0 ? version : index + 1,
          createdAt,
          expiresAt,
          active: entry.active !== false,
          label:
            typeof entry.label === 'string' && entry.label.trim().length > 0
              ? entry.label.trim()
              : `rotated-api-key-v${version > 0 ? version : index + 1}`,
          roles: normalizeRoles(entry.roles, ['admin']),
        });
      }
    } catch (e) {
      console.warn('[AUTH] Failed to parse API_KEY_ROTATION config, ignoring');
    }
  }

  // Primary key from API_KEY env var (fallback only when rotation list is absent)
  if (keys.length === 0) {
    const primaryKey = process.env.API_KEY;
    if (primaryKey) {
      keys.push({
        key: primaryKey,
        version: 1,
        createdAt: nowIso,
        expiresAt: defaultExpiresAt,
        active: true,
        label: 'primary-api-key',
        roles: ['admin'],
      });
    }
  }

  return keys;
}

/**
 * Check if key is expired
 */
function isKeyExpired(key: ApiKeyConfig): boolean {
  const expiry = new Date(key.expiresAt);
  if (Number.isNaN(expiry.getTime())) return true;
  return new Date() > expiry;
}

/**
 * Check if key is near expiration (within grace period)
 */
function isKeyExpiringSoon(key: ApiKeyConfig, graceDays = 14): boolean {
  const now = new Date();
  const expiry = new Date(key.expiresAt);
  if (Number.isNaN(expiry.getTime())) return false;
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
  const authedReq = req as AuthenticatedRequest;
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
    if (safeEqualString(token, key.key)) {
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
  }

  res.setHeader('X-API-Key-Expires', keyMatch.expiresAt);

  // Valid token - proceed
  const requestId = crypto.randomUUID();
  const roles = normalizeRoles(keyMatch.roles, ['admin']);
  const role = resolveHighestRole(roles);
  const apiKeyLabel = keyMatch.label || `api-key-v${keyMatch.version}`;

  authedReq.auth = {
    requestId,
    actor: apiKeyLabel,
    role,
    roles,
    apiKeyVersion: keyMatch.version,
    apiKeyLabel,
    apiKeyExpiresAt: keyMatch.expiresAt,
  };

  res.setHeader('X-Request-Id', requestId);
  next();
}

export function requireRole(requiredRole: AuthRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authedReq = req as AuthenticatedRequest;
    const roles = authedReq.auth?.roles ?? [];

    if (!hasRequiredRole(roles, requiredRole)) {
      return res.status(403).json({
        error: 'Forbidden: Insufficient role for this endpoint',
        requiredRole,
      });
    }

    return next();
  };
}

export function auditProtectedAction(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authedReq = req as AuthenticatedRequest;
    const startedAt = Date.now();

    res.on('finish', () => {
      console.log('[AUDIT]', {
        timestamp: new Date().toISOString(),
        requestId: authedReq.auth?.requestId ?? null,
        action,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        actor: authedReq.auth?.actor ?? 'unknown',
        role: authedReq.auth?.role ?? 'unknown',
        outcome: res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'denied-or-failed',
      });
    });

    next();
  };
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
