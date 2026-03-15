// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, closeDatabase } from '../src/db/database';
import { createAutomationRuleWithConditions, getCardById, getAutomationRuleById } from '../src/db/repositories';
import { runScheduledAutomations } from '../src/automation/runner';

beforeAll(() => {
  process.env.SEED_DATA = 'true';
});

describe('automation runner', () => {
  afterEach(() => { closeDatabase(); });

  function createRule(
    db: Awaited<ReturnType<typeof createDatabase>>,
    id: string,
    trigger: 'date_time' | 'weekday' | 'monthly' | 'heartbeat',
    triggerConfig: Record<string, unknown>,
    action: 'assign_member' | 'add_label' | 'move_to_list' | 'mark_due_complete',
    actionConfig: Record<string, string>,
    lastRunAt: string | null,
    conditions = { listId: 'l1', labelId: null as string | null },
  ) {
    createAutomationRuleWithConditions(
      db,
      id,
      'b1',
      id,
      trigger,
      triggerConfig,
      conditions,
      action,
      actionConfig,
      true,
      lastRunAt,
    );
  }

  it('executes a date_time rule against matching cards only once', async () => {
    const db = await createDatabase(':memory:');
    createRule(db, 'rule-date-time', 'date_time', { runAt: '2026-03-14T15:00:00.000Z' }, 'mark_due_complete', {}, null, { listId: 'l1', labelId: 'lb2' });

    runScheduledAutomations(db, new Date('2026-03-14T15:05:00.000Z'));
    runScheduledAutomations(db, new Date('2026-03-14T15:10:00.000Z'));

    expect(getCardById(db, 'c5')?.dueDateComplete).toBe(true);
    expect(getCardById(db, 'c3')?.dueDateComplete).toBe(false);
    expect(getAutomationRuleById(db, 'rule-date-time')?.lastRunAt).not.toBeNull();
  });

  it('executes a weekday rule once per time slot', async () => {
    const db = await createDatabase(':memory:');
    createRule(db, 'rule-weekday', 'weekday', { weekdays: [6], time: '09:00' }, 'add_label', { labelId: 'lb1' }, null);
    const firstRun = new Date(2026, 2, 14, 9, 15, 0, 0);
    const secondRun = new Date(2026, 2, 14, 9, 45, 0, 0);

    runScheduledAutomations(db, firstRun);
    runScheduledAutomations(db, secondRun);

    const card = getCardById(db, 'c5');
    expect(card?.labelIds).toContain('lb1');
    expect(card?.labelIds.filter(labelId => labelId === 'lb1')).toHaveLength(1);
    expect(getAutomationRuleById(db, 'rule-weekday')?.lastRunAt).toBe(firstRun.toISOString());
  });

  it('executes a monthly rule on the configured day and time', async () => {
    const db = await createDatabase(':memory:');
    createRule(db, 'rule-monthly', 'monthly', { dayOfMonth: 14, time: '11:00' }, 'move_to_list', { listId: 'l4' }, null);
    const now = new Date(2026, 2, 14, 11, 30, 0, 0);

    runScheduledAutomations(db, now);

    expect(getCardById(db, 'c5')?.listId).toBe('l4');
    expect(getAutomationRuleById(db, 'rule-monthly')?.lastRunAt).toBe(now.toISOString());
  });

  it('executes a heartbeat rule after the configured interval elapses', async () => {
    const db = await createDatabase(':memory:');
    const initialRunAt = new Date(2026, 2, 14, 8, 0, 0, 0);
    const tooSoon = new Date(2026, 2, 14, 8, 30, 0, 0);
    const eligibleRun = new Date(2026, 2, 14, 9, 5, 0, 0);
    createRule(db, 'rule-heartbeat', 'heartbeat', { intervalValue: 60, intervalUnit: 'minutes' }, 'assign_member', { memberId: 'u2' }, initialRunAt.toISOString());

    runScheduledAutomations(db, tooSoon);
    expect(getCardById(db, 'c5')?.memberIds).not.toContain('u2');

    runScheduledAutomations(db, eligibleRun);

    expect(getCardById(db, 'c5')?.memberIds).toContain('u2');
    expect(getAutomationRuleById(db, 'rule-heartbeat')?.lastRunAt).toBe(eligibleRun.toISOString());
  });
});
