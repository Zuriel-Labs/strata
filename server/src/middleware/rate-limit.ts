import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

/**
 * Standard rate limit handler — returns 429 with a human-readable message
 * and a Retry-After header so clients know when to back off.
 */
function rateLimitHandler(_request: Request, response: Response): void {
  response.status(429).json({
    message: 'Too many requests. Please try again later.',
  });
}

/**
 * Check if rate limiting is disabled (test mode).
 */
function isRateLimitDisabled(): boolean {
  return process.env.STRATA_RATE_LIMIT_DISABLED === 'true';
}

/**
 * Login rate limiter: 5 attempts per minute per IP.
 * Protects against brute-force password attacks.
 */
export const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: () => isRateLimitDisabled(),
});

/**
 * Bootstrap rate limiter: 3 attempts per minute per IP.
 * The bootstrap endpoint creates the first admin user — tighter limit
 * prevents abuse while still allowing legitimate first-time setup.
 */
export const bootstrapLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: () => isRateLimitDisabled(),
});

/**
 * Recovery key consume rate limiter: 3 attempts per minute per IP.
 * Recovery key consumption resets passwords — tight limit prevents abuse.
 */
export const recoveryKeyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: () => isRateLimitDisabled(),
});