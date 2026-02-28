import rateLimit from 'express-rate-limit';

/**
 * Rate Limiting Configuration
 * Prevents DoS attacks and protects resource limits
 */

/**
 * Webhook Rate Limiter (AlertManager)
 * Allows up to 100 requests per minute
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: 'Too many webhook requests, please retry after a minute',
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
});

/**
 * API Rate Limiter (General Knowledge Base & Persistence APIs)
 * Allows up to 30 requests per minute per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute  
  max: 30,
  message: 'Too many requests, please retry after a minute',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict Rate Limiter (Expensive Operations)
 * Allows up to 5 requests per minute
 * Used for: export, bulk operations, resource-intensive queries
 */
export const exportLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: 'Bulk export rate limit exceeded, please retry after a minute',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Auth Rate Limiter (Login/Auth Attempts)
 * Allows up to 10 requests per minute
 * prevents brute force attacks
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many authentication attempts, please retry after a minute',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests, including successful
});

/**
 * Health Check Rate Limiter (Lenient for monitoring)
 * Allows up to 1000 requests per minute (for health monitoring)
 */
export const healthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  // Don't send response for health checks, just let through
  skip: () => false,
});
