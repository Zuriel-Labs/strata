import { buildAutomationRuleInput, createDefaultAutomationForm } from './automation-rule-form';

describe('automation rule form helpers', () => {
  it('builds a trimmed assign-member rule payload', () => {
    const form = {
      ...createDefaultAutomationForm(),
      name: '  Assign reviewer  ',
      triggerListId: 'l4',
      conditionLabelId: 'lb2',
      actionMemberId: 'u2',
    };

    expect(buildAutomationRuleInput('b1', form)).toEqual({
      input: {
        boardId: 'b1',
        name: 'Assign reviewer',
        trigger: 'card_moved',
        triggerConfig: { toListId: 'l4' },
        conditions: { listId: null, labelId: 'lb2' },
        action: 'assign_member',
        actionConfig: { memberId: 'u2' },
        enabled: true,
      },
      error: null,
    });
  });

  it('validates scheduled triggers before creating a rule', () => {
    const weekdayForm = {
      ...createDefaultAutomationForm(),
      name: 'Weekday rule',
      trigger: 'weekday' as const,
      actionMemberId: 'u1',
    };
    const monthlyForm = {
      ...createDefaultAutomationForm(),
      name: 'Monthly rule',
      trigger: 'monthly' as const,
      scheduleDayOfMonth: '99',
      actionMemberId: 'u1',
    };
    const heartbeatForm = {
      ...createDefaultAutomationForm(),
      name: 'Heartbeat rule',
      trigger: 'heartbeat' as const,
      scheduleIntervalValue: '0',
      actionMemberId: 'u1',
    };

    expect(buildAutomationRuleInput('b1', weekdayForm)).toEqual({ input: null, error: 'Select at least one weekday.' });
    expect(buildAutomationRuleInput('b1', monthlyForm)).toEqual({ input: null, error: 'Choose a day of the month between 1 and 31.' });
    expect(buildAutomationRuleInput('b1', heartbeatForm)).toEqual({ input: null, error: 'Choose an interval greater than zero.' });
  });

  it('builds date_time, monthly, and heartbeat trigger configs correctly', () => {
    const dateTimeForm = {
      ...createDefaultAutomationForm(),
      name: 'Release reminder',
      trigger: 'date_time' as const,
      scheduleDateTime: '2026-03-21T09:15',
      action: 'mark_due_complete' as const,
    };
    const monthlyForm = {
      ...createDefaultAutomationForm(),
      name: 'Monthly sweep',
      trigger: 'monthly' as const,
      scheduleDayOfMonth: '14',
      scheduleTime: '13:30',
      action: 'move_to_list' as const,
      actionListId: 'l5',
    };
    const heartbeatForm = {
      ...createDefaultAutomationForm(),
      name: 'Heartbeat sweep',
      trigger: 'heartbeat' as const,
      scheduleIntervalValue: '2',
      scheduleIntervalUnit: 'hours' as const,
      action: 'add_label' as const,
      actionLabelId: 'lb1',
    };

    expect(buildAutomationRuleInput('b1', dateTimeForm).input?.triggerConfig).toEqual({ runAt: new Date('2026-03-21T09:15').toISOString() });
    expect(buildAutomationRuleInput('b1', monthlyForm).input?.triggerConfig).toEqual({ dayOfMonth: 14, time: '13:30' });
    expect(buildAutomationRuleInput('b1', heartbeatForm).input?.triggerConfig).toEqual({ intervalValue: 2, intervalUnit: 'hours' });
  });

  it('requires action-specific selections when needed', () => {
    const addLabelForm = {
      ...createDefaultAutomationForm(),
      name: 'Label rule',
      action: 'add_label' as const,
    };
    const moveForm = {
      ...createDefaultAutomationForm(),
      name: 'Move rule',
      action: 'move_to_list' as const,
    };

    expect(buildAutomationRuleInput('b1', addLabelForm)).toEqual({ input: null, error: 'Select a label to add.' });
    expect(buildAutomationRuleInput('b1', moveForm)).toEqual({ input: null, error: 'Select the destination list.' });
  });
});
