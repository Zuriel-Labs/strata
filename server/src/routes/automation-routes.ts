import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AutomationRule } from '../../../src/types';
import {
  createAutomationRuleWithConditions,
  updateAutomationRule,
  deleteAutomationRule,
  getAutomationRuleById,
  createAuditEvent,
  markNotificationRead,
  markAllNotificationsRead,
  getBoardById,
} from '../db/repositories';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canManageAutomation } from '../rbac/permissions';

const triggerEnum = z.enum(['card_moved', 'card_created', 'checklist_complete', 'date_time', 'weekday', 'monthly', 'heartbeat']);
const actionEnum = z.enum(['assign_member', 'add_label', 'move_to_list', 'mark_due_complete']);

const triggerConfigSchema = z.object({
  toListId: z.string().min(1).optional(),
  runAt: z.string().datetime().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  intervalValue: z.number().int().min(1).optional(),
  intervalUnit: z.enum(['minutes', 'hours']).optional(),
});

const conditionsSchema = z.object({
  listId: z.string().min(1).nullable(),
  labelId: z.string().min(1).nullable(),
});

const actionConfigSchema = z.object({
  memberId: z.string().min(1).optional(),
  labelId: z.string().min(1).optional(),
  listId: z.string().min(1).optional(),
});

const createRuleSchema = z.object({
  boardId: z.string().min(1),
  name: z.string().trim().min(1),
  trigger: triggerEnum,
  triggerConfig: triggerConfigSchema,
  conditions: conditionsSchema,
  action: actionEnum,
  actionConfig: actionConfigSchema,
  enabled: z.boolean(),
});

const updateRuleSchema = z.object({
  name: z.string().trim().min(1).optional(),
  trigger: triggerEnum.optional(),
  triggerConfig: triggerConfigSchema.optional(),
  conditions: conditionsSchema.optional(),
  action: actionEnum.optional(),
  actionConfig: actionConfigSchema.optional(),
  enabled: z.boolean().optional(),
}).strict();

function validateRuleForBoard(db: Database.Database, boardId: string, rule: Pick<AutomationRule, 'trigger' | 'triggerConfig' | 'conditions' | 'action' | 'actionConfig'>) {
  const board = getBoardById(db, boardId);
  if (!board) return 'Board not found.';

  const activeListIds = new Set(
    (db.prepare('SELECT id FROM lists WHERE board_id = ?').all(boardId) as Array<{ id: string }>).map(list => list.id),
  );
  const labelIds = new Set(board.labels.map(label => label.id));
  const userIds = new Set(
    (db.prepare('SELECT DISTINCT user_id as userId FROM board_memberships WHERE board_id = ?').all(boardId) as Array<{ userId: string }>).map(row => row.userId),
  );

  if (rule.trigger === 'card_moved' && rule.triggerConfig.toListId && !activeListIds.has(rule.triggerConfig.toListId)) {
    return 'Selected trigger list does not belong to this board.';
  }

  if (rule.trigger === 'date_time' && !rule.triggerConfig.runAt) {
    return 'Date and time trigger requires a runAt value.';
  }

  if (rule.trigger === 'weekday' && ((!rule.triggerConfig.weekdays || rule.triggerConfig.weekdays.length === 0) || !rule.triggerConfig.time)) {
    return 'Weekday trigger requires weekdays and time.';
  }

  if (rule.trigger === 'monthly' && (!rule.triggerConfig.dayOfMonth || !rule.triggerConfig.time)) {
    return 'Monthly trigger requires dayOfMonth and time.';
  }

  if (rule.trigger === 'heartbeat' && (!rule.triggerConfig.intervalValue || !rule.triggerConfig.intervalUnit)) {
    return 'Heartbeat trigger requires an interval value and unit.';
  }

  if (rule.conditions.listId && !activeListIds.has(rule.conditions.listId)) {
    return 'Selected list condition does not belong to this board.';
  }

  if (rule.conditions.labelId && !labelIds.has(rule.conditions.labelId)) {
    return 'Selected label condition does not belong to this board.';
  }

  if (rule.action === 'assign_member' && (!rule.actionConfig.memberId || !userIds.has(rule.actionConfig.memberId))) {
    return 'Selected automation member does not belong to this board.';
  }

  if (rule.action === 'add_label' && (!rule.actionConfig.labelId || !labelIds.has(rule.actionConfig.labelId))) {
    return 'Selected automation label does not belong to this board.';
  }

  if (rule.action === 'move_to_list' && (!rule.actionConfig.listId || !activeListIds.has(rule.actionConfig.listId))) {
    return 'Selected automation destination list does not belong to this board.';
  }

  return null;
}

function getInitialLastRunAt(trigger: AutomationRule['trigger']) {
  return trigger === 'heartbeat' ? new Date().toISOString() : null;
}

export function createAutomationRoutes(db: Database.Database) {
  const router = Router();

  router.post('/', requireAuth, (request: AuthenticatedRequest, response) => {
    const parsed = createRuleSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Invalid automation rule payload.' });
      return;
    }
    if (!canManageAutomation(db, request.auth!, parsed.data.boardId)) {
      response.status(403).json({ message: 'Access denied.' });
      return;
    }

    const validationMessage = validateRuleForBoard(db, parsed.data.boardId, parsed.data);
    if (validationMessage) {
      response.status(validationMessage === 'Board not found.' ? 404 : 400).json({ message: validationMessage });
      return;
    }

    const id = randomUUID();
    const lastRunAt = getInitialLastRunAt(parsed.data.trigger);
    createAutomationRuleWithConditions(
      db,
      id,
      parsed.data.boardId,
      parsed.data.name,
      parsed.data.trigger,
      parsed.data.triggerConfig,
      parsed.data.conditions,
      parsed.data.action,
      parsed.data.actionConfig,
      parsed.data.enabled,
      lastRunAt,
    );
    createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: parsed.data.boardId, action: 'automation.create', outcome: 'success' });
    const rule = getAutomationRuleById(db, id);
    response.status(201).json(rule);
  });

  router.patch('/:ruleId', requireAuth, (request: AuthenticatedRequest, response) => {
    const ruleId = String(request.params.ruleId);
    const existingRule = getAutomationRuleById(db, ruleId);
    if (!existingRule) {
      response.status(404).json({ message: 'Rule not found.' });
      return;
    }
    if (!canManageAutomation(db, request.auth!, existingRule.boardId)) {
      response.status(403).json({ message: 'Access denied.' });
      return;
    }

    const parsed = updateRuleSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Invalid payload.' });
      return;
    }

    const nextRule: AutomationRule = {
      ...existingRule,
      ...parsed.data,
      triggerConfig: parsed.data.triggerConfig ?? existingRule.triggerConfig,
      conditions: parsed.data.conditions ?? existingRule.conditions,
      actionConfig: parsed.data.actionConfig ?? existingRule.actionConfig,
    };

    const validationMessage = validateRuleForBoard(db, existingRule.boardId, nextRule);
    if (validationMessage) {
      response.status(validationMessage === 'Board not found.' ? 404 : 400).json({ message: validationMessage });
      return;
    }

    const shouldResetLastRunAt = parsed.data.trigger !== undefined || parsed.data.triggerConfig !== undefined;
    updateAutomationRule(db, ruleId, {
      ...parsed.data,
      lastRunAt: shouldResetLastRunAt ? getInitialLastRunAt(nextRule.trigger) : undefined,
    });
    createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: existingRule.boardId, action: 'automation.update', outcome: 'success' });
    const updated = getAutomationRuleById(db, ruleId);
    response.json(updated);
  });

  router.delete('/:ruleId', requireAuth, (request: AuthenticatedRequest, response) => {
    const rule = getAutomationRuleById(db, String(request.params.ruleId));
    if (!rule) {
      response.status(404).json({ message: 'Rule not found.' });
      return;
    }
    if (!canManageAutomation(db, request.auth!, rule.boardId)) {
      response.status(403).json({ message: 'Access denied.' });
      return;
    }
    deleteAutomationRule(db, String(request.params.ruleId));
    createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: rule.boardId, action: 'automation.delete', outcome: 'success' });
    response.status(204).send();
  });

  return router;
}

export function createNotificationRoutes(db: Database.Database) {
  const router = Router();

  router.post('/:notificationId/read', requireAuth, (request: AuthenticatedRequest, response) => {
    markNotificationRead(db, String(request.params.notificationId));
    response.json({ success: true });
  });

  router.post('/read-all', requireAuth, (request: AuthenticatedRequest, response) => {
    markAllNotificationsRead(db, request.auth!.user.id);
    response.json({ success: true });
  });

  return router;
}
