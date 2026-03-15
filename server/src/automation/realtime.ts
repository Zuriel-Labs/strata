import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AutomationRule, Card, Checklist } from '../../../src/types';
import { createNotification, getCardById, getMaxCardPosition, getUserById, listEventAutomationRules, updateCard } from '../db/repositories';

function ruleMatchesConditions(card: Card, conditions: AutomationRule['conditions']) {
  if (conditions.listId && card.listId !== conditions.listId) return false;
  if (conditions.labelId && !card.labelIds.includes(conditions.labelId)) return false;
  return true;
}

function appendActivity(card: Card, userId: string, action: string): Card {
  return {
    ...card,
    activity: [...card.activity, { id: randomUUID(), userId, action, createdAt: new Date().toISOString() }],
  };
}

function createNotificationsForUsers(db: Database.Database, userIds: string[], actorUserId: string, card: Card, message: string) {
  const uniqueUserIds = [...new Set(userIds)].filter(userId => userId !== actorUserId);
  for (const userId of uniqueUserIds) {
    createNotification(db, randomUUID(), userId, card.id, card.boardId, message);
  }
}

export function applyRealtimeAutomations(
  db: Database.Database,
  card: Card,
  trigger: 'card_created' | 'card_moved' | 'checklist_complete',
  actorUserId: string,
  extra?: { toListId?: string },
) {
  let nextCard = card;
  const rules = listEventAutomationRules(db, card.boardId, trigger);

  for (const rule of rules) {
    if (trigger === 'card_moved' && rule.triggerConfig.toListId && extra?.toListId !== rule.triggerConfig.toListId) continue;
    if (!ruleMatchesConditions(nextCard, rule.conditions)) continue;

    if (rule.action === 'assign_member' && rule.actionConfig.memberId && !nextCard.memberIds.includes(rule.actionConfig.memberId)) {
      const memberId = rule.actionConfig.memberId;
      nextCard = appendActivity({ ...nextCard, memberIds: [...nextCard.memberIds, memberId], watching: true }, actorUserId, 'automatically assigned a member');
      updateCard(db, nextCard.id, { memberIds: nextCard.memberIds, watching: nextCard.watching, activity: nextCard.activity });
      createNotificationsForUsers(db, [memberId], actorUserId, nextCard, `Automation assigned you to "${nextCard.title}"`);
      const user = getUserById(db, memberId);
      createNotification(db, randomUUID(), actorUserId, nextCard.id, nextCard.boardId, `Automation: ${user?.name || 'Someone'} assigned to "${nextCard.title}"`);
    }

    if (rule.action === 'add_label' && rule.actionConfig.labelId && !nextCard.labelIds.includes(rule.actionConfig.labelId)) {
      nextCard = appendActivity({ ...nextCard, labelIds: [...nextCard.labelIds, rule.actionConfig.labelId] }, actorUserId, 'automatically added a label');
      updateCard(db, nextCard.id, { labelIds: nextCard.labelIds, activity: nextCard.activity });
    }

    if (rule.action === 'move_to_list' && rule.actionConfig.listId && nextCard.listId !== rule.actionConfig.listId) {
      nextCard = appendActivity({ ...nextCard, listId: rule.actionConfig.listId, position: getMaxCardPosition(db, rule.actionConfig.listId) + 1 }, actorUserId, 'automatically moved this card');
      updateCard(db, nextCard.id, { listId: nextCard.listId, position: nextCard.position, activity: nextCard.activity });
      const refreshed = getCardById(db, nextCard.id);
      if (refreshed) nextCard = refreshed;
    }

    if (rule.action === 'mark_due_complete' && !nextCard.dueDateComplete) {
      nextCard = appendActivity({ ...nextCard, dueDateComplete: true }, actorUserId, 'automatically marked the due date complete');
      updateCard(db, nextCard.id, { dueDateComplete: true, activity: nextCard.activity });
    }

    const refreshed = getCardById(db, nextCard.id);
    if (refreshed) nextCard = refreshed;
  }

  return nextCard;
}

export function becameChecklistComplete(previousChecklists: Checklist[], nextChecklists: Checklist[]) {
  const previousCompleted = previousChecklists.some(checklist => checklist.items.length > 0 && checklist.items.every(item => item.completed));
  const nextCompleted = nextChecklists.some(checklist => checklist.items.length > 0 && checklist.items.every(item => item.completed));
  return !previousCompleted && nextCompleted;
}
