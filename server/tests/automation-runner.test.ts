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

  it('executes scheduled rules against matching board cards only', async () => {
    const db = await createDatabase(':memory:');
    createAutomationRuleWithConditions(
      db,
      'rule-date-time',
      'b1',
      'Complete matching feature cards',
      'date_time',
      { runAt: '2026-03-14T15:00:00.000Z' },
      { listId: 'l1', labelId: 'lb2' },
      'mark_due_complete',
      {},
      true,
      null,
    );

    runScheduledAutomations(db, new Date('2026-03-14T15:05:00.000Z'));

    expect(getCardById(db, 'c5')?.dueDateComplete).toBe(true);
    expect(getCardById(db, 'c3')?.dueDateComplete).toBe(false);
    expect(getAutomationRuleById(db, 'rule-date-time')?.lastRunAt).not.toBeNull();
  });
});
