import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
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

export function requireContentAuth(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  if (!request.auth) { response.status(401).json({ message: 'Authentication required.' }); return; }
  if (!request.auth.user.active || request.auth.user.mustChangePassword) {
    response.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your initial password before continuing.' }); return;
  }
  next();
}

export const safeContentErrors: ErrorRequestHandler = (error, request, response, next) => {
  void error; void request; void next;
  response.status(500).json({ code: 'OPERATION_FAILED', message: 'Unable to save changes. Nothing was changed.' });
};
