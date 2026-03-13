import type { Response } from 'express';
import type Database from 'better-sqlite3';
import { createSession, deleteSession, getBoardMembershipsForUser, getSession, getUserById, getWorkspaceMembershipsForUser } from '../db/repositories';
import type { AuthContextValue } from '../types';

export const SESSION_COOKIE = process.env.STRATA_SESSION_COOKIE ?? 'strata_session';

export function setSessionCookie(response: Response, sessionId: string) {
  response.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
  });
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function createUserSession(db: Database.Database, userId: string, response: Response) {
  const session = createSession(db, userId);
  setSessionCookie(response, session.id);
  return session;
}

export function destroyUserSession(db: Database.Database, sessionId: string | undefined, response: Response) {
  if (sessionId) deleteSession(db, sessionId);
  clearSessionCookie(response);
}

export function getAuthContextFromRequest(db: Database.Database, sessionId: string | undefined) {
  if (!sessionId) return null;
  const session = getSession(db, sessionId);
  if (!session) return null;
  const user = getUserById(db, session.userId);
  if (!user || !user.active) return null;
  return {
    user,
    session,
    workspaceMemberships: getWorkspaceMembershipsForUser(db, user.id),
    boardMemberships: getBoardMembershipsForUser(db, user.id),
  } satisfies AuthContextValue;
}
