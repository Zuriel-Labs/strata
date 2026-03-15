import type { AutomationRule } from '../types';

export type AutomationRuleInput = Omit<AutomationRule, 'id' | 'lastRunAt'>;

export interface AutomationFormState {
  name: string;
  trigger: AutomationRule['trigger'];
  triggerListId: string;
  conditionListId: string;
  conditionLabelId: string;
  scheduleDateTime: string;
  scheduleWeekdays: number[];
  scheduleTime: string;
  scheduleDayOfMonth: string;
  scheduleIntervalValue: string;
  scheduleIntervalUnit: 'minutes' | 'hours';
  action: AutomationRule['action'];
  actionMemberId: string;
  actionLabelId: string;
  actionListId: string;
}

export const supportedTriggers: AutomationRule['trigger'][] = ['card_moved', 'card_created', 'checklist_complete', 'date_time', 'weekday', 'monthly', 'heartbeat'];
export const supportedActions: AutomationRule['action'][] = ['assign_member', 'add_label', 'move_to_list', 'mark_due_complete'];

export const triggerLabels: Record<AutomationRule['trigger'], string> = {
  card_moved: 'When a card is moved to a list',
  card_created: 'When a card is created',
  checklist_complete: 'When all checklist items are done',
  due_date_reached: 'When a due date is reached',
  date_time: 'At a specific date and time',
  weekday: 'On selected weekdays',
  monthly: 'On a day of the month',
  heartbeat: 'Every interval',
};

export const actionLabels: Record<AutomationRule['action'], string> = {
  assign_member: 'Assign a member',
  add_label: 'Add a label',
  move_to_list: 'Move to a list',
  mark_due_complete: 'Mark due date complete',
};

export function createDefaultAutomationForm(): AutomationFormState {
  return {
    name: '',
    trigger: 'card_moved',
    triggerListId: '',
    conditionListId: '',
    conditionLabelId: '',
    scheduleDateTime: '',
    scheduleWeekdays: [],
    scheduleTime: '09:00',
    scheduleDayOfMonth: '1',
    scheduleIntervalValue: '1',
    scheduleIntervalUnit: 'hours',
    action: 'assign_member',
    actionMemberId: '',
    actionLabelId: '',
    actionListId: '',
  };
}

export function buildAutomationRuleInput(boardId: string, form: AutomationFormState): { input: AutomationRuleInput | null; error: string | null } {
  const trimmedName = form.name.trim();
  if (!trimmedName) {
    return { input: null, error: 'Rule name is required.' };
  }

  const triggerConfig: AutomationRule['triggerConfig'] = {};
  if (form.trigger === 'card_moved' && form.triggerListId) {
    triggerConfig.toListId = form.triggerListId;
  }

  if (form.trigger === 'date_time') {
    if (!form.scheduleDateTime) {
      return { input: null, error: 'Choose the date and time for this automation.' };
    }
    const runAt = new Date(form.scheduleDateTime);
    if (Number.isNaN(runAt.getTime())) {
      return { input: null, error: 'Enter a valid date and time.' };
    }
    triggerConfig.runAt = runAt.toISOString();
  }

  if (form.trigger === 'weekday') {
    if (form.scheduleWeekdays.length === 0) {
      return { input: null, error: 'Select at least one weekday.' };
    }
    if (!form.scheduleTime) {
      return { input: null, error: 'Choose a time for the weekday schedule.' };
    }
    triggerConfig.weekdays = form.scheduleWeekdays;
    triggerConfig.time = form.scheduleTime;
  }

  if (form.trigger === 'monthly') {
    if (!form.scheduleTime) {
      return { input: null, error: 'Choose a time for the monthly schedule.' };
    }
    const dayOfMonth = Number(form.scheduleDayOfMonth);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return { input: null, error: 'Choose a day of the month between 1 and 31.' };
    }
    triggerConfig.dayOfMonth = dayOfMonth;
    triggerConfig.time = form.scheduleTime;
  }

  if (form.trigger === 'heartbeat') {
    const intervalValue = Number(form.scheduleIntervalValue);
    if (!Number.isInteger(intervalValue) || intervalValue < 1) {
      return { input: null, error: 'Choose an interval greater than zero.' };
    }
    triggerConfig.intervalValue = intervalValue;
    triggerConfig.intervalUnit = form.scheduleIntervalUnit;
  }

  const actionConfig: Record<string, string> = {};
  if (form.action === 'assign_member') {
    if (!form.actionMemberId) {
      return { input: null, error: 'Select a member to assign.' };
    }
    actionConfig.memberId = form.actionMemberId;
  }

  if (form.action === 'add_label') {
    if (!form.actionLabelId) {
      return { input: null, error: 'Select a label to add.' };
    }
    actionConfig.labelId = form.actionLabelId;
  }

  if (form.action === 'move_to_list') {
    if (!form.actionListId) {
      return { input: null, error: 'Select the destination list.' };
    }
    actionConfig.listId = form.actionListId;
  }

  return {
    input: {
      boardId,
      name: trimmedName,
      trigger: form.trigger,
      triggerConfig,
      conditions: {
        listId: form.conditionListId || null,
        labelId: form.conditionLabelId || null,
      },
      action: form.action,
      actionConfig,
      enabled: true,
    },
    error: null,
  };
}
