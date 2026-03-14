import { useState } from 'react';
import { useAppState, useDispatch } from '../store';
import type { AutomationRule } from '../types';
import { createAutomationRuleApi, updateAutomationRuleApi, deleteAutomationRuleApi } from '../services/data';

const supportedTriggers: AutomationRule['trigger'][] = ['card_moved', 'card_created', 'checklist_complete', 'date_time', 'weekday', 'monthly', 'heartbeat'];
const supportedActions: AutomationRule['action'][] = ['assign_member', 'add_label', 'move_to_list', 'mark_due_complete'];

export function AutomationPanel() {
  const state = useAppState();
  const dispatch = useDispatch();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{
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
  }>({ name: '', trigger: 'card_moved', triggerListId: '', conditionListId: '', conditionLabelId: '', scheduleDateTime: '', scheduleWeekdays: [], scheduleTime: '09:00', scheduleDayOfMonth: '1', scheduleIntervalValue: '1', scheduleIntervalUnit: 'hours', action: 'assign_member', actionMemberId: '', actionLabelId: '', actionListId: '' });

  if (!state.automationPanelOpen || !state.currentBoardId) return null;

  const rules = state.automationRules.filter(r => r.boardId === state.currentBoardId);
  const lists = state.lists.filter(l => l.boardId === state.currentBoardId && !l.archived).sort((a, b) => a.position - b.position);
  const board = state.boards.find(b => b.id === state.currentBoardId);

  const triggerLabels: Record<AutomationRule['trigger'], string> = {
    card_moved: 'When a card is moved to a list',
    card_created: 'When a card is created',
    checklist_complete: 'When all checklist items are done',
    due_date_reached: 'When a due date is reached',
    date_time: 'At a specific date and time',
    weekday: 'On selected weekdays',
    monthly: 'On a day of the month',
    heartbeat: 'Every interval',
  };
  const actionLabels: Record<AutomationRule['action'], string> = {
    assign_member: 'Assign a member',
    add_label: 'Add a label',
    move_to_list: 'Move to a list',
    mark_due_complete: 'Mark due date complete',
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const triggerConfig: AutomationRule['triggerConfig'] = {};
    if (form.trigger === 'card_moved' && form.triggerListId) triggerConfig.toListId = form.triggerListId;
    if (form.trigger === 'date_time' && form.scheduleDateTime) triggerConfig.runAt = new Date(form.scheduleDateTime).toISOString();
    if (form.trigger === 'weekday') {
      triggerConfig.weekdays = form.scheduleWeekdays;
      triggerConfig.time = form.scheduleTime;
    }
    if (form.trigger === 'monthly') {
      triggerConfig.dayOfMonth = Number(form.scheduleDayOfMonth);
      triggerConfig.time = form.scheduleTime;
    }
    if (form.trigger === 'heartbeat') {
      triggerConfig.intervalValue = Number(form.scheduleIntervalValue);
      triggerConfig.intervalUnit = form.scheduleIntervalUnit;
    }

    const conditions = { listId: form.conditionListId || null, labelId: form.conditionLabelId || null };
    const actionConfig: Record<string, string> = {};
    if (form.action === 'assign_member' && form.actionMemberId) actionConfig.memberId = form.actionMemberId;
    if (form.action === 'add_label' && form.actionLabelId) actionConfig.labelId = form.actionLabelId;
    if (form.action === 'move_to_list' && form.actionListId) actionConfig.listId = form.actionListId;

    const rule = await createAutomationRuleApi({ boardId: state.currentBoardId!, name: form.name, trigger: form.trigger, triggerConfig, conditions, action: form.action, actionConfig, enabled: true });
    dispatch({ type: 'ADD_AUTOMATION_RULE_FROM_API', payload: rule });
    setForm({ name: '', trigger: 'card_moved', triggerListId: '', conditionListId: '', conditionLabelId: '', scheduleDateTime: '', scheduleWeekdays: [], scheduleTime: '09:00', scheduleDayOfMonth: '1', scheduleIntervalValue: '1', scheduleIntervalUnit: 'hours', action: 'assign_member', actionMemberId: '', actionLabelId: '', actionListId: '' });
    setAdding(false);
  };

  return (
    <div className="w-80 border-l shrink-0 overflow-y-auto" style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          <span className="mr-1.5">⚡</span>Automations
        </h2>
        <button onClick={() => dispatch({ type: 'SET_AUTOMATION_PANEL', payload: false })} className="w-8 h-8 rounded-md flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)', background: 'var(--active-bg)' }}>✕</button>
      </div>

      <div className="p-4 space-y-3">
        {rules.map(rule => {
          const triggerList = state.lists.find(l => l.id === rule.triggerConfig.toListId);
          const actionUser = state.users.find(u => u.id === rule.actionConfig.memberId);
          const actionLabel = board?.labels.find(l => l.id === rule.actionConfig.labelId);
          const actionList = state.lists.find(l => l.id === rule.actionConfig.listId);
          return (
            <div key={rule.id} className="rounded-lg p-3 border" style={{ borderColor: 'var(--border)', background: 'var(--card-bg)', opacity: rule.enabled ? 1 : 0.5 }}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{rule.name}</h4>
                <div className="flex items-center gap-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => { dispatch({ type: 'UPDATE_AUTOMATION_RULE', payload: { id: rule.id, enabled: !rule.enabled } }); updateAutomationRuleApi(rule.id, { enabled: !rule.enabled }); }}
                      className="sr-only peer"
                    />
                    <div className="w-7 h-4 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:rounded-full after:h-3 after:w-3 after:transition-all" style={{ background: rule.enabled ? 'var(--accent)' : 'var(--border)', }}><div className="w-3 h-3 rounded-full absolute top-[2px] transition-all" style={{ background: '#fff', left: rule.enabled ? '14px' : '2px' }} /></div>
                  </label>
                  <button onClick={() => { dispatch({ type: 'DELETE_AUTOMATION_RULE', payload: rule.id }); deleteAutomationRuleApi(rule.id); }} className="w-7 h-7 rounded flex items-center justify-center text-xs" style={{ color: '#ef4444', background: 'var(--active-bg)' }}>✕</button>
                </div>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                <strong>When:</strong> {triggerLabels[rule.trigger]}{triggerList ? ` → "${triggerList.title}"` : ''}<br />
                <strong>Conditions:</strong> Lists: {rule.conditions.listId ? (lists.find(l => l.id === rule.conditions.listId)?.title ?? 'Any list') : 'Any list'} • Labels: {rule.conditions.labelId ? (board?.labels.find(l => l.id === rule.conditions.labelId)?.name ?? 'Any labels') : 'Any labels'}<br />
                <strong>Then:</strong> {actionLabels[rule.action]}
                {actionUser && ` → ${actionUser.name}`}
                {actionLabel && ` → ${actionLabel.name}`}
                {actionList && ` → "${actionList.title}"`}
              </p>
            </div>
          );
        })}

        {rules.length === 0 && !adding && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No automation rules yet. Create one to automate repetitive actions.</p>
        )}

        {adding ? (
          <div className="rounded-lg p-3 border space-y-2" style={{ borderColor: 'var(--accent)', background: 'var(--card-bg)' }}>
            <input
              autoFocus
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Rule name…"
              className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
            <div>
              <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Trigger</label>
               <select value={form.trigger} onChange={e => setForm({ ...form, trigger: e.target.value as AutomationRule['trigger'] })} className="w-full mt-0.5 px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                 {supportedTriggers.map(trigger => <option key={trigger} value={trigger}>{triggerLabels[trigger]}</option>)}
               </select>
            </div>
            {form.trigger === 'card_moved' && (
              <select value={form.triggerListId} onChange={e => setForm({ ...form, triggerListId: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                <option value="">Any list</option>
                {lists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            )}
            {form.trigger === 'date_time' && <input type="datetime-local" value={form.scheduleDateTime} onChange={e => setForm({ ...form, scheduleDateTime: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />}
            {form.trigger === 'weekday' && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                    <button key={day} type="button" onClick={() => setForm(current => ({ ...current, scheduleWeekdays: current.scheduleWeekdays.includes(index) ? current.scheduleWeekdays.filter(value => value !== index) : [...current.scheduleWeekdays, index] }))} className="min-h-[44px] rounded-md px-3 text-xs font-medium" style={{ background: form.scheduleWeekdays.includes(index) ? 'var(--accent)' : 'var(--active-bg)', color: form.scheduleWeekdays.includes(index) ? '#fff' : 'var(--text-secondary)' }}>{day}</button>
                  ))}
                </div>
                <input type="time" value={form.scheduleTime} onChange={e => setForm({ ...form, scheduleTime: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>
            )}
            {form.trigger === 'monthly' && (
              <div className="grid gap-2 sm:grid-cols-2">
                <input type="number" min="1" max="31" value={form.scheduleDayOfMonth} onChange={e => setForm({ ...form, scheduleDayOfMonth: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                <input type="time" value={form.scheduleTime} onChange={e => setForm({ ...form, scheduleTime: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>
            )}
            {form.trigger === 'heartbeat' && (
              <div className="grid gap-2 sm:grid-cols-2">
                <input type="number" min="1" value={form.scheduleIntervalValue} onChange={e => setForm({ ...form, scheduleIntervalValue: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                <select value={form.scheduleIntervalUnit} onChange={e => setForm({ ...form, scheduleIntervalUnit: e.target.value as 'minutes' | 'hours' })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                </select>
              </div>
            )}
            <div>
              <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Lists</label>
              <select value={form.conditionListId} onChange={e => setForm({ ...form, conditionListId: e.target.value })} className="w-full mt-0.5 px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                <option value="">Any list</option>
                {lists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Labels</label>
              <select value={form.conditionLabelId} onChange={e => setForm({ ...form, conditionLabelId: e.target.value })} className="w-full mt-0.5 px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                <option value="">Any labels</option>
                {board?.labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Action</label>
               <select value={form.action} onChange={e => setForm({ ...form, action: e.target.value as AutomationRule['action'] })} className="w-full mt-0.5 px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                 {supportedActions.map(action => <option key={action} value={action}>{actionLabels[action]}</option>)}
               </select>
            </div>
            {form.action === 'assign_member' && (
              <select value={form.actionMemberId} onChange={e => setForm({ ...form, actionMemberId: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                <option value="">Select member…</option>
                {state.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
            {form.action === 'add_label' && (
              <select value={form.actionLabelId} onChange={e => setForm({ ...form, actionLabelId: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                <option value="">Select label…</option>
                {board?.labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            {form.action === 'move_to_list' && (
              <select value={form.actionListId} onChange={e => setForm({ ...form, actionListId: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                <option value="">Select list…</option>
                {lists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            )}
            <div className="flex gap-1 pt-1">
              <button onClick={handleSave} className="px-3 min-h-[44px] rounded text-xs font-medium text-white" style={{ background: 'var(--accent)' }}>Create Rule</button>
              <button onClick={() => setAdding(false)} className="px-3 min-h-[44px] text-xs" style={{ color: 'var(--text-muted)' }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full px-3 min-h-[44px] flex items-center justify-center rounded-lg text-xs font-medium border border-dashed transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
          >
            + Create automation rule
          </button>
        )}
      </div>
    </div>
  );
}
