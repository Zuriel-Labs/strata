import type { NextFunction, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { getAuthContextFromRequest, SESSION_COOKIE } from '../auth/session';

export type AuthenticatedRequest = Request & { auth?: ReturnType<typeof getAuthContextFromRequest> };

export function attachAuth(db: Database.Database) {
  return (request: AuthenticatedRequest, _response: Response, next: NextFunction) => {
    request.auth = getAuthContextFromRequest(db, request.cookies?.[SESSION_COOKIE]);
    next();
  };
}

export function requireAuth(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  if (!request.auth) {
    response.status(401).json({ message: 'Authentication required.' });
    return;
  }
  next();
}
