import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { createAutomationRule, updateAutomationRule, deleteAutomationRule, getAutomationRuleById, createAuditEvent, markNotificationRead, markAllNotificationsRead } from '../db/repositories';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canManageBoard } from '../rbac/permissions';

const createRuleSchema = z.object({
  boardId: z.string().min(1),
  name: z.string().min(1),
  trigger: z.enum(['card_moved', 'card_created', 'due_date_reached', 'checklist_complete']),
  triggerConfig: z.record(z.string(), z.string()),
  action: z.enum(['assign_member', 'add_label', 'move_to_list', 'mark_due_complete']),
  actionConfig: z.record(z.string(), z.string()),
  enabled: z.boolean(),
});

const updateRuleSchema = z.object({
  name: z.string().optional(),
  trigger: z.enum(['card_moved', 'card_created', 'due_date_reached', 'checklist_complete']).optional(),
  triggerConfig: z.record(z.string(), z.string()).optional(),
  action: z.enum(['assign_member', 'add_label', 'move_to_list', 'mark_due_complete']).optional(),
  actionConfig: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
});

export function createAutomationRoutes(db: Database.Database) {
  const router = Router();

  // Create automation rule
  router.post('/', requireAuth, (request: AuthenticatedRequest, response) => {
    const parsed = createRuleSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Invalid automation rule payload.' }); return; }
    if (!canManageBoard(db, request.auth!, parsed.data.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    const id = randomUUID();
    createAutomationRule(db, id, parsed.data.boardId, parsed.data.name, parsed.data.trigger, parsed.data.triggerConfig, parsed.data.action, parsed.data.actionConfig, parsed.data.enabled);
    createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: parsed.data.boardId, action: 'automation.create', outcome: 'success' });
    const rule = getAutomationRuleById(db, id);
    response.status(201).json(rule);
  });

  // Update automation rule
  router.patch('/:ruleId', requireAuth, (request: AuthenticatedRequest, response) => {
    const ruleId = String(request.params.ruleId);
    const rule = getAutomationRuleById(db, ruleId);
    if (!rule) { response.status(404).json({ message: 'Rule not found.' }); return; }
    if (!canManageBoard(db, request.auth!, rule.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    const parsed = updateRuleSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Invalid payload.' }); return; }
    updateAutomationRule(db, ruleId, parsed.data);
    const updated = getAutomationRuleById(db, ruleId);
    response.json(updated);
  });

  // Delete automation rule
  router.delete('/:ruleId', requireAuth, (request: AuthenticatedRequest, response) => {
    const rule = getAutomationRuleById(db, String(request.params.ruleId));
    if (!rule) { response.status(404).json({ message: 'Rule not found.' }); return; }
    if (!canManageBoard(db, request.auth!, rule.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    deleteAutomationRule(db, String(request.params.ruleId));
    createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: rule.boardId, action: 'automation.delete', outcome: 'success' });
    response.status(204).send();
  });

  return router;
}

export function createNotificationRoutes(db: Database.Database) {
  const router = Router();

  // Mark single notification read
  router.post('/:notificationId/read', requireAuth, (request: AuthenticatedRequest, response) => {
    markNotificationRead(db, String(request.params.notificationId));
    response.json({ success: true });
  });

  // Mark all notifications read
  router.post('/read-all', requireAuth, (request: AuthenticatedRequest, response) => {
    markAllNotificationsRead(db, request.auth!.user.id);
    response.json({ success: true });
  });

  return router;
}
