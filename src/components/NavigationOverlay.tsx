import { useState } from 'react';
import { useAppState, useDispatch } from '../store';
import { useAuth } from '../lib/auth-context';
import { createWorkspace } from '../services/admin';
import { createBoardApi, toggleBoardStarApi, updateCardApi, deleteCardApi, restoreListApi } from '../services/data';
import type { AutomationRule } from '../types';
import { createAutomationRuleApi, updateAutomationRuleApi, deleteAutomationRuleApi } from '../services/data';

type NavTab = 'workspaces' | 'boards' | 'automations' | 'archive';

const supportedTriggers: AutomationRule['trigger'][] = ['card_moved', 'card_created', 'checklist_complete'];
const supportedActions: AutomationRule['action'][] = ['assign_member', 'add_label', 'move_to_list', 'mark_due_complete'];

const triggerLabels: Record<AutomationRule['trigger'], string> = {
  card_moved: 'When a card is moved to a list',
  card_created: 'When a card is created',
  due_date_reached: 'When a due date is reached',
  checklist_complete: 'When all checklist items are done',
};
const actionLabels: Record<AutomationRule['action'], string> = {
  assign_member: 'Assign a member',
  add_label: 'Add a label',
  move_to_list: 'Move to a list',
  mark_due_complete: 'Mark due date complete',
};

export function NavigationOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useAppState();
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('boards');
  const [newBoardName, setNewBoardName] = useState('');
  const [addingBoard, setAddingBoard] = useState(false);
  const [addingWorkspace, setAddingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceDesc, setNewWorkspaceDesc] = useState('');

  if (!open) return null;

  const currentWs = state.workspaces.find(w => w.id === state.currentWorkspaceId);
  const boards = state.boards.filter(b => b.workspaceId === state.currentWorkspaceId);
  const canManageWorkspace = auth.canManageWorkspace(state.currentWorkspaceId);
  const boardColors = ['#6366f1', '#0891b2', '#059669', '#ea580c', '#dc2626', '#7c3aed', '#be185d'];

  const tabs: { key: NavTab; label: string; icon: React.ReactNode }[] = [
    { key: 'workspaces', label: 'Workspaces', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> },
    { key: 'boards', label: 'Boards', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
    { key: 'automations', label: 'Automations', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> },
    { key: 'archive', label: 'Archive', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg> },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center pt-16" style={{ background: 'rgba(6, 9, 14, 0.6)' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl max-h-[80vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden" style={{ background: 'var(--modal-bg)', borderColor: 'var(--border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Navigation</h2>
          <button className="w-8 h-8 rounded-md flex items-center justify-center text-sm transition-colors" style={{ color: 'var(--text-muted)', background: 'var(--active-bg)' }} onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-4 shrink-0" style={{ borderColor: 'var(--border)' }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              className="flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors"
              style={{
                borderColor: activeTab === tab.key ? 'var(--accent)' : 'transparent',
                color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'workspaces' && (
            <WorkspacesContent
              addingWorkspace={addingWorkspace}
              setAddingWorkspace={setAddingWorkspace}
              newWorkspaceName={newWorkspaceName}
              setNewWorkspaceName={setNewWorkspaceName}
              newWorkspaceDesc={newWorkspaceDesc}
              setNewWorkspaceDesc={setNewWorkspaceDesc}
              onClose={onClose}
            />
          )}

          {activeTab === 'boards' && (
            <BoardsContent
              boards={boards}
              currentWs={currentWs}
              addingBoard={addingBoard}
              setAddingBoard={setAddingBoard}
              newBoardName={newBoardName}
              setNewBoardName={setNewBoardName}
              boardColors={boardColors}
              canManageWorkspace={canManageWorkspace}
              onClose={onClose}
            />
          )}

          {activeTab === 'automations' && (
            <AutomationsContent />
          )}

          {activeTab === 'archive' && (
            <ArchiveContent />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Workspaces Tab ── */

function WorkspacesContent({
  addingWorkspace, setAddingWorkspace, newWorkspaceName, setNewWorkspaceName, newWorkspaceDesc, setNewWorkspaceDesc, onClose,
}: {
  addingWorkspace: boolean; setAddingWorkspace: (v: boolean) => void;
  newWorkspaceName: string; setNewWorkspaceName: (v: string) => void;
  newWorkspaceDesc: string; setNewWorkspaceDesc: (v: string) => void;
  onClose: () => void;
}) {
  const state = useAppState();
  const dispatch = useDispatch();
  const auth = useAuth();

  return (
    <div className="space-y-2">
      {state.workspaces.map(w => (
        <button
          key={w.id}
          className="w-full flex items-center gap-3 rounded-xl px-4 min-h-[52px] transition-colors text-left"
          style={{
            background: state.currentWorkspaceId === w.id ? 'var(--active-bg)' : 'transparent',
            color: 'var(--text-primary)',
          }}
          onClick={() => { dispatch({ type: 'SET_CURRENT_WORKSPACE', payload: w.id }); onClose(); }}
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: '#6366f1' }}>
            {w.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{w.name}</p>
            {w.description && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{w.description}</p>}
          </div>
        </button>
      ))}

      {auth.session?.permissions.isSystemAdmin && !addingWorkspace && (
        <button
          onClick={() => setAddingWorkspace(true)}
          className="w-full px-4 min-h-[44px] flex items-center justify-center rounded-xl text-xs font-medium border border-dashed transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
        >
          + Create workspace
        </button>
      )}

      {addingWorkspace && (
        <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--card-bg)' }}>
          <input autoFocus value={newWorkspaceName} onChange={e => setNewWorkspaceName(e.target.value)} placeholder="Workspace name…" className="w-full px-3 min-h-[44px] text-sm rounded-lg border outline-none" style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
          <input value={newWorkspaceDesc} onChange={e => setNewWorkspaceDesc(e.target.value)} placeholder="Description (optional)" className="w-full px-3 min-h-[44px] text-sm rounded-lg border outline-none" style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
          <div className="flex gap-2">
            <button className="px-3 min-h-[44px] text-xs rounded-lg font-semibold" style={{ background: 'var(--accent)', color: '#fff' }} onClick={async () => {
              if (!newWorkspaceName.trim()) return;
              const result = await createWorkspace({ name: newWorkspaceName.trim(), description: newWorkspaceDesc.trim(), visibility: 'private' });
              dispatch({ type: 'ADD_WORKSPACE', payload: { id: result.id, name: result.name, description: result.description, memberIds: [], visibility: result.visibility as 'private' | 'workspace' } });
              setNewWorkspaceName(''); setNewWorkspaceDesc(''); setAddingWorkspace(false);
              await auth.refresh();
            }}>Create</button>
            <button className="px-3 min-h-[44px] text-xs rounded-lg" style={{ color: 'var(--text-muted)' }} onClick={() => { setAddingWorkspace(false); setNewWorkspaceName(''); setNewWorkspaceDesc(''); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Boards Tab ── */

function BoardsContent({
  boards, currentWs, addingBoard, setAddingBoard, newBoardName, setNewBoardName, boardColors, canManageWorkspace, onClose,
}: {
  boards: ReturnType<typeof useAppState>['boards'];
  currentWs: ReturnType<typeof useAppState>['workspaces'][0] | undefined;
  addingBoard: boolean; setAddingBoard: (v: boolean) => void;
  newBoardName: string; setNewBoardName: (v: string) => void;
  boardColors: string[];
  canManageWorkspace: boolean;
  onClose: () => void;
}) {
  const state = useAppState();
  const dispatch = useDispatch();

  const starred = boards.filter(b => b.starred);
  const unstarred = boards.filter(b => !b.starred);

  return (
    <div className="space-y-4">
      {currentWs && <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{currentWs.name}</p>}

      {starred.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>★ Starred</p>
          <div className="space-y-1">
            {starred.map(b => (
              <BoardRow key={b.id} board={b} isActive={state.currentBoardId === b.id} onSelect={() => { dispatch({ type: 'SET_CURRENT_BOARD', payload: b.id }); onClose(); }} onToggleStar={() => { dispatch({ type: 'TOGGLE_BOARD_STAR', payload: b.id }); toggleBoardStarApi(b.id); }} />
            ))}
          </div>
        </div>
      )}

      <div>
        {starred.length > 0 && <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>All Boards</p>}
        <div className="space-y-1">
          {unstarred.map(b => (
            <BoardRow key={b.id} board={b} isActive={state.currentBoardId === b.id} onSelect={() => { dispatch({ type: 'SET_CURRENT_BOARD', payload: b.id }); onClose(); }} onToggleStar={() => { dispatch({ type: 'TOGGLE_BOARD_STAR', payload: b.id }); toggleBoardStarApi(b.id); }} />
          ))}
        </div>
      </div>

      {canManageWorkspace && !addingBoard && (
        <button
          onClick={() => setAddingBoard(true)}
          className="w-full px-4 min-h-[44px] flex items-center justify-center rounded-xl text-xs font-medium border border-dashed transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
        >
          + Add board
        </button>
      )}

      {addingBoard && (
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card-bg)' }}>
          <input
            autoFocus
            value={newBoardName}
            onChange={e => setNewBoardName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newBoardName.trim() && state.currentWorkspaceId) {
                const title = newBoardName.trim();
                const color = boardColors[Math.floor(Math.random() * boardColors.length)];
                createBoardApi({ workspaceId: state.currentWorkspaceId, title, color }).then(board => { dispatch({ type: 'ADD_BOARD_FROM_API', payload: board }); });
                setNewBoardName(''); setAddingBoard(false); onClose();
              }
              if (e.key === 'Escape') { setAddingBoard(false); setNewBoardName(''); }
            }}
            placeholder="Board name…"
            className="w-full px-3 min-h-[44px] text-sm rounded-lg border outline-none"
            style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
      )}
    </div>
  );
}

function BoardRow({ board, isActive, onSelect, onToggleStar }: { board: ReturnType<typeof useAppState>['boards'][0]; isActive: boolean; onSelect: () => void; onToggleStar: () => void }) {
  return (
    <div className="flex items-center group">
      <button
        onClick={onSelect}
        className="flex-1 flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm transition-colors"
        style={{
          background: isActive ? 'var(--active-bg)' : 'transparent',
          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
      >
        <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: board.color }} />
        <span className="truncate">{board.title}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide ml-auto" style={{ background: 'var(--active-bg)', color: 'var(--text-muted)' }}>
          {board.visibility}
        </span>
      </button>
      <button
        onClick={e => { e.stopPropagation(); onToggleStar(); }}
        className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-md flex items-center justify-center text-sm transition-opacity"
        style={{ color: board.starred ? '#eab308' : 'var(--text-muted)' }}
      >
        {board.starred ? '★' : '☆'}
      </button>
    </div>
  );
}

/* ── Automations Tab ── */

function AutomationsContent() {
  const state = useAppState();
  const dispatch = useDispatch();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', trigger: 'card_moved' as AutomationRule['trigger'], triggerListId: '', action: 'assign_member' as AutomationRule['action'], actionMemberId: '', actionLabelId: '', actionListId: '' });

  if (!state.currentBoardId) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Select a board to manage automations.</p>;

  const rules = state.automationRules.filter(r => r.boardId === state.currentBoardId);
  const lists = state.lists.filter(l => l.boardId === state.currentBoardId && !l.archived).sort((a, b) => a.position - b.position);
  const board = state.boards.find(b => b.id === state.currentBoardId);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const triggerConfig: Record<string, string> = {};
    if (form.trigger === 'card_moved' && form.triggerListId) triggerConfig.toListId = form.triggerListId;
    const actionConfig: Record<string, string> = {};
    if (form.action === 'assign_member' && form.actionMemberId) actionConfig.memberId = form.actionMemberId;
    if (form.action === 'add_label' && form.actionLabelId) actionConfig.labelId = form.actionLabelId;
    if (form.action === 'move_to_list' && form.actionListId) actionConfig.listId = form.actionListId;
    const rule = await createAutomationRuleApi({ boardId: state.currentBoardId!, name: form.name, trigger: form.trigger, triggerConfig, action: form.action, actionConfig, enabled: true });
    dispatch({ type: 'ADD_AUTOMATION_RULE_FROM_API', payload: rule });
    setForm({ name: '', trigger: 'card_moved', triggerListId: '', action: 'assign_member', actionMemberId: '', actionLabelId: '', actionListId: '' });
    setAdding(false);
  };

  return (
    <div className="space-y-3">
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
                  <input type="checkbox" checked={rule.enabled} onChange={() => { dispatch({ type: 'UPDATE_AUTOMATION_RULE', payload: { id: rule.id, enabled: !rule.enabled } }); updateAutomationRuleApi(rule.id, { enabled: !rule.enabled }); }} className="sr-only peer" />
                  <div className="w-7 h-4 rounded-full peer" style={{ background: rule.enabled ? 'var(--accent)' : 'var(--border)' }}><div className="w-3 h-3 rounded-full absolute top-[2px] transition-all" style={{ background: '#fff', left: rule.enabled ? '14px' : '2px' }} /></div>
                </label>
                <button onClick={() => { dispatch({ type: 'DELETE_AUTOMATION_RULE', payload: rule.id }); deleteAutomationRuleApi(rule.id); }} className="w-7 h-7 rounded flex items-center justify-center text-xs" style={{ color: '#ef4444', background: 'var(--active-bg)' }}>✕</button>
              </div>
            </div>
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              <strong>When:</strong> {triggerLabels[rule.trigger]}{triggerList ? ` → "${triggerList.title}"` : ''}<br />
              <strong>Then:</strong> {actionLabels[rule.action]}
              {actionUser && ` → ${actionUser.name}`}
              {actionLabel && ` → ${actionLabel.name}`}
              {actionList && ` → "${actionList.title}"`}
            </p>
          </div>
        );
      })}

      {rules.length === 0 && !adding && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No automation rules yet. Create one to automate repetitive actions.</p>}

      {adding ? (
        <div className="rounded-lg p-3 border space-y-2" style={{ borderColor: 'var(--accent)', background: 'var(--card-bg)' }}>
          <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Rule name…" className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent outline-none" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
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
            <button onClick={() => void handleSave()} className="px-3 min-h-[44px] rounded text-xs font-medium text-white" style={{ background: 'var(--accent)' }}>Create Rule</button>
            <button onClick={() => setAdding(false)} className="px-3 min-h-[44px] text-xs" style={{ color: 'var(--text-muted)' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="w-full px-3 min-h-[44px] flex items-center justify-center rounded-lg text-xs font-medium border border-dashed transition-colors" style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>
          + Create automation rule
        </button>
      )}
    </div>
  );
}

/* ── Archive Tab ── */

function ArchiveContent() {
  const state = useAppState();
  const dispatch = useDispatch();

  if (!state.currentBoardId) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Select a board to view its archive.</p>;

  const archivedLists = state.lists.filter(l => l.archived && l.boardId === state.currentBoardId);
  const archivedCards = state.cards.filter(c => c.archived && c.boardId === state.currentBoardId);

  if (archivedLists.length === 0 && archivedCards.length === 0) {
    return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nothing archived on this board.</p>;
  }

  return (
    <div className="space-y-2">
      {archivedLists.map(l => (
        <div key={l.id} className="flex items-center justify-between px-3 min-h-[44px] text-xs rounded-lg" style={{ background: 'var(--active-bg)', color: 'var(--text-secondary)' }}>
          <span className="truncate">📋 {l.title}</span>
          <button onClick={() => { dispatch({ type: 'RESTORE_LIST', payload: l.id }); restoreListApi(l.id); }} className="text-xs underline shrink-0 ml-1 min-h-[44px] flex items-center" style={{ color: 'var(--accent)' }}>Restore</button>
        </div>
      ))}
      {archivedCards.map(c => (
        <div key={c.id} className="flex items-center justify-between px-3 min-h-[44px] text-xs rounded-lg" style={{ background: 'var(--active-bg)', color: 'var(--text-secondary)' }}>
          <span className="truncate">🃏 {c.title}</span>
          <div className="flex gap-1 shrink-0 ml-1">
            <button onClick={() => { dispatch({ type: 'RESTORE_CARD', payload: c.id }); updateCardApi(c.id, { archived: false }); }} className="text-xs underline min-h-[44px] flex items-center" style={{ color: 'var(--accent)' }}>Restore</button>
            <button onClick={() => { dispatch({ type: 'DELETE_CARD', payload: c.id }); deleteCardApi(c.id); }} className="text-xs underline min-h-[44px] flex items-center" style={{ color: '#ef4444' }}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
