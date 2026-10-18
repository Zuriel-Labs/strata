import { randomUUID } from 'node:crypto';
import { isListActive } from '../rbac/lifecycle';
import type Database from 'better-sqlite3';
import type { AutomationRule, Card } from '../../../src/types';
import { createAuditEvent, getMaxCardPosition, listActiveCardsForAutomation, listScheduledAutomationRules, setAutomationRuleLastRunAt, updateCard } from '../db/repositories';

function getCurrentSlotKey(now: Date, time?: string) {
  const date = now.toISOString().slice(0, 10);
  return `${date}T${time ?? '00:00'}`;
}

function ranInCurrentSlot(lastRunAt: string | null, now: Date, time?: string) {
  if (!lastRunAt) return false;
  return getCurrentSlotKey(new Date(lastRunAt), time) === getCurrentSlotKey(now, time);
}

function timeReached(now: Date, time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return now.getHours() > hour || (now.getHours() === hour && now.getMinutes() >= minute);
}

function shouldRunRule(rule: AutomationRule, now: Date) {
  if (rule.trigger === 'date_time') {
    return Boolean(rule.triggerConfig.runAt && !rule.lastRunAt && new Date(rule.triggerConfig.runAt).getTime() <= now.getTime());
  }

  if (rule.trigger === 'weekday') {
    if (!rule.triggerConfig.weekdays?.includes(now.getDay()) || !rule.triggerConfig.time || !timeReached(now, rule.triggerConfig.time)) return false;
    return !ranInCurrentSlot(rule.lastRunAt, now, rule.triggerConfig.time);
  }

  if (rule.trigger === 'monthly') {
    if (rule.triggerConfig.dayOfMonth !== now.getDate() || !rule.triggerConfig.time || !timeReached(now, rule.triggerConfig.time)) return false;
    return !ranInCurrentSlot(rule.lastRunAt, now, rule.triggerConfig.time);
  }

  if (rule.trigger === 'heartbeat') {
    if (!rule.triggerConfig.intervalValue || !rule.triggerConfig.intervalUnit || !rule.lastRunAt) return false;
    const intervalMs = rule.triggerConfig.intervalValue * (rule.triggerConfig.intervalUnit === 'hours' ? 60 * 60 * 1000 : 60 * 1000);
    return now.getTime() - new Date(rule.lastRunAt).getTime() >= intervalMs;
  }

  return false;
}

function buildActivity(card: Card, action: string) {
  return [...card.activity, { id: randomUUID(), userId: 'system', action, createdAt: new Date().toISOString() }];
}

function applyRuleToCard(db: Database.Database, rule: AutomationRule, card: Card) {
  if (rule.action === 'assign_member' && rule.actionConfig.memberId && !card.memberIds.includes(rule.actionConfig.memberId)) {
    updateCard(db, card.id, {
      memberIds: [...card.memberIds, rule.actionConfig.memberId],
      watching: true,
      activity: buildActivity(card, 'automatically assigned a member'),
    });
    return true;
  }

  if (rule.action === 'add_label' && rule.actionConfig.labelId && !card.labelIds.includes(rule.actionConfig.labelId)) {
    updateCard(db, card.id, {
      labelIds: [...card.labelIds, rule.actionConfig.labelId],
      activity: buildActivity(card, 'automatically added a label'),
    });
    return true;
  }

  if (rule.action === 'move_to_list' && rule.actionConfig.listId && isListActive(db, rule.actionConfig.listId) && card.listId !== rule.actionConfig.listId) {
    updateCard(db, card.id, {
      listId: rule.actionConfig.listId,
      position: getMaxCardPosition(db, rule.actionConfig.listId) + 1,
      activity: buildActivity(card, 'automatically moved this card'),
    });
    return true;
  }

  if (rule.action === 'mark_due_complete' && !card.dueDateComplete) {
    updateCard(db, card.id, {
      dueDateComplete: true,
      activity: buildActivity(card, 'automatically marked the due date complete'),
    });
    return true;
  }

  return false;
}

export function runScheduledAutomations(db: Database.Database, now = new Date()) {
  const rules = listScheduledAutomationRules(db);
  for (const rule of rules) {
    if (!shouldRunRule(rule, now)) continue;
    db.transaction(() => {
    const cards = listActiveCardsForAutomation(db, rule.boardId, rule.conditions);
    let affectedCards = 0;
    for (const card of cards.filter(card => isListActive(db, card.listId))) {
      if (applyRuleToCard(db, rule, card)) {
        affectedCards += 1;
      }
    }
    setAutomationRuleLastRunAt(db, rule.id, now.toISOString());
    createAuditEvent(db, {
      scopeType: 'board',
      scopeId: rule.boardId,
      action: 'automation.execute',
      outcome: 'success',
      metadata: { ruleId: rule.id, affectedCards, trigger: rule.trigger },
    });
    })();
  }
}

export function startAutomationRunner(db: Database.Database, intervalMs = 60_000) {
  const timer = setInterval(() => {
    runScheduledAutomations(db, new Date());
  }, intervalMs);
  return () => clearInterval(timer);
}
