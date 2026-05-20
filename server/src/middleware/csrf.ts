import type { Request, Response, NextFunction } from 'express';
import { randomBytes, timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';

export const CSRF_COOKIE = 'strata_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';

/**
 * Routes that are CSRF-exempt because they operate without an existing session:
 * - /api/auth/login — no session yet, CSRF provides no protection here
 * - /api/auth/bootstrap — first-time setup, no session exists
 * - /api/auth/recovery-key/consume — password recovery, no session
 */
const CSRF_EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/bootstrap',
  '/api/auth/recovery-key/consume',
  '/api/auth/csrf-token',
]);

/**
 * Generate a cryptographically random CSRF token (64 hex chars = 32 bytes).
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Set the CSRF cookie and return the token value.
 * The cookie is NOT httpOnly — the client JavaScript must read it
 * to compare against the header value (double-submit pattern).
 * However, we rely on the server-side comparison of the header value
 * (which the attacker cannot set due to CORS/SameSite) rather than
 * the client reading the cookie. The cookie is set with SameSite=lax
 * for defense-in-depth.
 */
export function setCsrfCookie(request: Request, response: Response, token: string) {
  const secure = process.env.NODE_ENV === 'production' || request.secure;
  response.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
  });
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return cryptoTimingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * CSRF validation middleware using the double-submit cookie pattern.
 *
 * For mutating requests (POST, PATCH, PUT, DELETE):
 * 1. Read the CSRF token from the X-CSRF-Token header
 * 2. Read the CSRF token from the strata_csrf cookie
 * 3. If both are present and match, proceed
 * 4. Otherwise, reject with 403
 *
 * Safe methods (GET, HEAD, OPTIONS) skip validation.
 * Exempt paths (login, bootstrap, recovery-key/consume) skip validation.
 *
 * In test mode (STRATA_CSRF_DISABLED=true), CSRF enforcement is skipped
 * entirely. This allows test suites (supertest) to run without CSRF tokens
 * while still verifying the middleware works in production. The dedicated
 * CSRF test file sets STRATA_CSRF_DISABLED=false to test enforcement.
 */
export function csrfProtection(request: Request, response: Response, next: NextFunction) {
  // Skip CSRF enforcement in test mode
  if (process.env.STRATA_CSRF_DISABLED === 'true') {
    next();
    return;
  }

  // Safe methods don't need CSRF protection
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    next();
    return;
  }

  // Exempt paths skip CSRF validation
  if (CSRF_EXEMPT_PATHS.has(request.path)) {
    next();
    return;
  }

  const cookieToken = request.cookies?.[CSRF_COOKIE];
  const headerToken = request.headers[CSRF_HEADER.toLowerCase()] as string | undefined;

  if (!cookieToken || !headerToken) {
    response.status(403).json({ message: 'CSRF token missing.' });
    return;
  }

  if (!safeEqual(cookieToken, headerToken)) {
    response.status(403).json({ message: 'CSRF token mismatch.' });
    return;
  }

  next();
}