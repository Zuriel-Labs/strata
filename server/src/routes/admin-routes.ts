import { randomBytes } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { createManagedUser, deleteBoardMembership, deleteManagedUser, getAdminUserDetail, listAdminResources, listAdminUsersPage, listBoardMembers, listEligibleUsers, updateManagedUser, upsertBoardMembership } from '../db/admin-repositories';
import { deleteSessionsForUser, getBoardById, getUserById, listAuditEvents, upsertRecoveryKey } from '../db/repositories';
import { DISABLED_PASSWORD_HASH } from '../auth/passwords';
import { hashRecoveryKey } from '../auth/recovery-keys';
import { createUserSession } from '../auth/session';
import { audit } from '../audit/audit-log';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canAccessAdminPanel, canManageUserBoard, canManageUserPlatform } from '../rbac/policies';

const assignmentSchema = z.object({
  workspaceAdminWorkspaceIds: z.array(z.string().min(1)).default([]),
  boardAdminBoardIds: z.array(z.string().min(1)).default([]),
  boardMemberships: z.array(z.object({ boardId: z.string().min(1), role: z.enum(['member', 'observer']) })).default([]),
});
const userSchema = z.object({
  name: z.string().trim().min(1), initials: z.string().trim().min(1).max(4), color: z.string().min(4),
  username: z.string().trim().min(1), platformRole: z.enum(['system_admin', 'user']).default('user'),
  active: z.boolean().default(true), expectedUpdatedAt: z.string().datetime().nullable().optional(),
}).and(assignmentSchema);
const userPatchSchema = z.object({
  name: z.string().trim().min(1).optional(), initials: z.string().trim().min(1).max(4).optional(), color: z.string().min(4).optional(),
  username: z.string().trim().min(1).optional(), platformRole: z.enum(['system_admin', 'user']).optional(), active: z.boolean().optional(),
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
}).and(assignmentSchema);
const pageSchema = z.object({
  query: z.string().max(100).default('').transform(value => value.trim()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const resourceSchema = pageSchema.extend({
  kind: z.enum(['workspace', 'board']),
  workspaceId: z.string().optional(),
  selectedIds: z.string().max(4000).optional().transform(value => value ? value.split(',').filter(Boolean) : []).refine(ids => ids.length <= 100),
});
const membershipSchema = z.object({ role: z.enum(['member', 'observer']) });

function errorResponse(response: Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unable to complete request.';
  if (message.includes('changed since') || message.includes('currently authenticated') || message.includes('last remaining system administrator')) response.status(409).json({ message });
  else if (message.includes('UNIQUE constraint')) response.status(409).json({ message: 'That username or assignment already exists.' });
  else response.status(400).json({ message });
}

function denyMutation(db:Database.Database,request:AuthenticatedRequest,response:Response,input:{action:string;scopeType:'platform'|'board';scopeId?:string;targetUserId?:string}){
  if(request.auth) audit(db,{actorUserId:request.auth.user.id,targetUserId:input.targetUserId??null,scopeType:input.scopeType,scopeId:input.scopeId??null,action:input.action,outcome:'failure',metadata:{reason:'forbidden'}});
  response.status(403).json({message:'Forbidden.'});
}

export function createAdminRoutes(db: Database.Database) {
  const router = Router(); router.use(requireAuth);

  router.get('/users', (request: AuthenticatedRequest, response: Response) => {
    if (!request.auth || !canAccessAdminPanel(request.auth)) { response.status(403).json({ message: 'Forbidden.' }); return; }
    const parsed = pageSchema.safeParse(request.query); if (!parsed.success) { response.status(400).json({ message: 'Invalid directory query.' }); return; }
    const result = listAdminUsersPage(db, request.auth, parsed.data);
    const systemAdmin = canManageUserPlatform(request.auth);
    response.json({ ...result, actorCapabilities: { canCreateUsers: systemAdmin, canManageAccess: systemAdmin, canViewAudit: systemAdmin }, auditEvents: systemAdmin ? listAuditEvents(db, 25) : [] });
  });

  router.get('/users/:userId', (request: AuthenticatedRequest, response: Response) => {
    if (!request.auth || !canAccessAdminPanel(request.auth)) { response.status(403).json({ message: 'Forbidden.' }); return; }
    const user = getAdminUserDetail(db, request.auth, String(request.params.userId));
    if (!user) { response.status(404).json({ message: 'User not found.' }); return; }
    response.json({ user });
  });

  router.get('/resources', (request: AuthenticatedRequest, response: Response) => {
    if (!request.auth || !canAccessAdminPanel(request.auth)) { response.status(403).json({ message: 'Forbidden.' }); return; }
    const parsed = resourceSchema.safeParse(request.query); if (!parsed.success) { response.status(400).json({ message: 'Invalid resource query.' }); return; }
    response.json(listAdminResources(db, request.auth, parsed.data.kind, parsed.data, parsed.data.workspaceId, parsed.data.selectedIds));
  });

  router.post('/users', async (request: AuthenticatedRequest, response: Response) => {
    if (!request.auth || !canManageUserPlatform(request.auth)) { denyMutation(db,request,response,{action:'user.create',scopeType:'platform'}); return; }
    const parsed = userSchema.safeParse(request.body); if (!parsed.success) { response.status(400).json({ message: 'Invalid user payload.', issues: parsed.error.issues }); return; }
    try {
      const inviteToken = randomBytes(32).toString('hex');
      const created = db.transaction(() => {
        const user = createManagedUser(db, request.auth!.user, { ...parsed.data, passwordHash: DISABLED_PASSWORD_HASH, mustChangePassword: false });
        if (user) upsertRecoveryKey(db, user.id, hashRecoveryKey(inviteToken));
        return user;
      })();
      if (!created) { response.status(500).json({ message: 'Unable to create user.' }); return; }
      response.status(201).json({ user: created, inviteToken });
    } catch (error) { errorResponse(response, error); }
  });

  router.patch('/users/:userId', (request: AuthenticatedRequest, response: Response) => {
    if (!request.auth || !canManageUserPlatform(request.auth)) { denyMutation(db,request,response,{action:'user.update',scopeType:'platform',targetUserId:String(request.params.userId)}); return; }
    const parsed = userPatchSchema.safeParse(request.body); if (!parsed.success) { response.status(400).json({ message: 'Invalid user update payload.', issues: parsed.error.issues }); return; }
    const userId = String(request.params.userId); const current = getUserById(db, userId);
    if (!current) { response.status(404).json({ message: 'User not found.' }); return; }
    try {
      const updated = updateManagedUser(db, request.auth.user, userId, parsed.data);
      if (!updated) { response.status(404).json({ message: 'User not found.' }); return; }
      const deletedCount = deleteSessionsForUser(db, userId);
      if (userId === request.auth.user.id && updated.active) createUserSession(db,userId,request,response);
      audit(db, { actorUserId: request.auth.user.id, targetUserId: userId, scopeType: 'platform', action: 'admin.session_invalidation', outcome: 'success', metadata: { reason: 'access_or_account_change', sessionsInvalidated: deletedCount } });
      response.json({ user: updated });
    } catch (error) { errorResponse(response, error); }
  });

  router.get('/boards/:boardId/members', (request: AuthenticatedRequest, response: Response) => {
    if (!request.auth) { response.status(401).json({ message: 'Authentication required.' }); return; }
    const parsed = pageSchema.safeParse(request.query); if (!parsed.success) { response.status(400).json({ message: 'Invalid member query.' }); return; }
    const result = listBoardMembers(db, request.auth, String(request.params.boardId), parsed.data);
    if (!result) { response.status(403).json({ message: 'Forbidden.' }); return; } response.json(result);
  });

  router.get('/boards/:boardId/eligible-users', (request: AuthenticatedRequest, response: Response) => {
    if (!request.auth) { response.status(401).json({ message: 'Authentication required.' }); return; }
    const boardId = String(request.params.boardId); if (!getBoardById(db, boardId)) { response.status(404).json({ message: 'Board not found.' }); return; }
    const parsed = pageSchema.safeParse(request.query); if (!parsed.success) { response.status(400).json({ message: 'Invalid user query.' }); return; }
    const result = listEligibleUsers(db, request.auth, boardId, parsed.data); if (!result) { response.status(403).json({ message: 'Forbidden.' }); return; } response.json(result);
  });

  router.put('/boards/:boardId/members/:userId', (request: AuthenticatedRequest, response: Response) => {
    if (!request.auth) { response.status(401).json({ message: 'Authentication required.' }); return; }
    const boardId = String(request.params.boardId); if (!canManageUserBoard(db, request.auth, boardId)) { denyMutation(db,request,response,{action:'board.membership_upsert',scopeType:'board',scopeId:boardId,targetUserId:String(request.params.userId)}); return; }
    const parsed = membershipSchema.safeParse(request.body); if (!parsed.success) { response.status(400).json({ message: 'Invalid membership payload.' }); return; }
    const membership = upsertBoardMembership(db, request.auth.user, boardId, String(request.params.userId), parsed.data.role);
    if (!membership) { response.status(404).json({ message: 'Active user not found.' }); return; }
    deleteSessionsForUser(db,membership.userId);
    if(membership.userId===request.auth.user.id)createUserSession(db,membership.userId,request,response);
    response.json({ membership });
  });

  router.delete('/boards/:boardId/members/:userId', (request: AuthenticatedRequest, response: Response) => {
    if (!request.auth) { response.status(401).json({ message: 'Authentication required.' }); return; }
    const boardId = String(request.params.boardId); if (!canManageUserBoard(db, request.auth, boardId)) { denyMutation(db,request,response,{action:'board.membership_delete',scopeType:'board',scopeId:boardId,targetUserId:String(request.params.userId)}); return; }
    const result = deleteBoardMembership(db, request.auth.user, boardId, String(request.params.userId));
    if (!result) { response.status(404).json({ message: 'Membership not found.' }); return; }
    deleteSessionsForUser(db,result.userId);
    if(result.userId===request.auth.user.id)createUserSession(db,result.userId,request,response);
    response.json(result);
  });

  router.post('/users/:userId/generate-recovery-key', async (request: AuthenticatedRequest, response: Response) => {
    if (!request.auth || !canManageUserPlatform(request.auth)) { denyMutation(db,request,response,{action:'auth.admin_recovery_key_generate',scopeType:'platform',targetUserId:String(request.params.userId)}); return; }
    const user = getUserById(db, String(request.params.userId)); if (!user) { response.status(404).json({ message: 'User not found.' }); return; }
    const recoveryKey = randomBytes(32).toString('hex'); upsertRecoveryKey(db, user.id, hashRecoveryKey(recoveryKey));
    audit(db, { actorUserId: request.auth.user.id, targetUserId: user.id, scopeType: 'auth', action: 'auth.admin_recovery_key_generate', outcome: 'success' });
    response.json({ recoveryKey });
  });

  router.delete('/users/:userId', (request: AuthenticatedRequest, response: Response) => {
    if (!request.auth || !canManageUserPlatform(request.auth)) { denyMutation(db,request,response,{action:'user.delete',scopeType:'platform',targetUserId:String(request.params.userId)}); return; }
    try { const deleted = deleteManagedUser(db, request.auth.user, String(request.params.userId)); if (!deleted) { response.status(404).json({ message: 'User not found.' }); return; } response.json(deleted); }
    catch (error) { errorResponse(response, error); }
  });
  return router;
}
