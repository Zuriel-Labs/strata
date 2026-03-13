import { useState } from 'react';
import { useAppState, useDispatch } from '../store';
import { useAuth } from '../lib/auth-context';

export function Sidebar() {
  const state = useAppState();
  const dispatch = useDispatch();
  const auth = useAuth();
  const [newBoardName, setNewBoardName] = useState('');
  const [addingBoard, setAddingBoard] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (!state.sidebarOpen) return null;

  const currentWs = state.workspaces.find(w => w.id === state.currentWorkspaceId);
  const boards = state.boards.filter(b => b.workspaceId === state.currentWorkspaceId);
  const starred = boards.filter(b => b.starred);

  const archivedLists = state.lists.filter(l => l.archived && l.boardId === state.currentBoardId);
  const archivedCards = state.cards.filter(c => c.archived && c.boardId === state.currentBoardId);

  const boardColors = ['#6366f1', '#0891b2', '#059669', '#ea580c', '#dc2626', '#7c3aed', '#be185d'];

  const canManageWorkspace = auth.canManageWorkspace(state.currentWorkspaceId);

  return (
    <aside className="w-64 h-full flex flex-col border-r" style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--border)' }}>
      {/* Workspace selector */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: '#6366f1' }}>
            {currentWs?.name.charAt(0) || 'W'}
          </div>
          <select
            value={state.currentWorkspaceId || ''}
            onChange={e => dispatch({ type: 'SET_CURRENT_WORKSPACE', payload: e.target.value })}
            className="flex-1 bg-transparent text-sm font-semibold outline-none cursor-pointer"
            style={{ color: 'var(--text-primary)' }}
          >
            {state.workspaces.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{currentWs?.description}</p>
      </div>

      {/* Starred boards */}
      {starred.length > 0 && (
        <div className="px-3 pt-4 pb-1">
          <h3 className="text-[10px] font-bold uppercase tracking-widest mb-2 px-1" style={{ color: 'var(--text-muted)' }}>
            ★ Starred
          </h3>
          {starred.map(b => (
            <button
              key={b.id}
              onClick={() => dispatch({ type: 'SET_CURRENT_BOARD', payload: b.id })}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm mb-0.5 transition-colors"
              style={{
                background: state.currentBoardId === b.id ? 'var(--active-bg)' : 'transparent',
                color: state.currentBoardId === b.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: b.color }} />
              <span className="truncate">{b.title}</span>
            </button>
          ))}
        </div>
      )}

      {/* All boards */}
      <div className="px-3 pt-4 pb-1 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Boards
          </h3>
          {canManageWorkspace && (
            <button
              onClick={() => setAddingBoard(true)}
              className="text-xs w-5 h-5 rounded flex items-center justify-center hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
            >
              +
            </button>
          )}
        </div>

        {boards.map(b => (
          <div
            key={b.id}
            className="flex items-center group"
          >
            <button
              onClick={() => dispatch({ type: 'SET_CURRENT_BOARD', payload: b.id })}
              className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm mb-0.5 transition-colors"
              style={{
                background: state.currentBoardId === b.id ? 'var(--active-bg)' : 'transparent',
                color: state.currentBoardId === b.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: b.color }} />
              <span className="truncate">{b.title}</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); dispatch({ type: 'TOGGLE_BOARD_STAR', payload: b.id }); }}
              className="opacity-0 group-hover:opacity-100 text-xs px-1 transition-opacity"
              style={{ color: b.starred ? '#eab308' : 'var(--text-muted)' }}
            >
              {b.starred ? '★' : '☆'}
            </button>
          </div>
        ))}

        {addingBoard && (
          <div className="mt-2 px-1">
            <input
              autoFocus
              value={newBoardName}
              onChange={e => setNewBoardName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newBoardName.trim() && state.currentWorkspaceId) {
                  dispatch({ type: 'ADD_BOARD', payload: { workspaceId: state.currentWorkspaceId, title: newBoardName.trim(), color: boardColors[Math.floor(Math.random() * boardColors.length)] } });
                  setNewBoardName('');
                  setAddingBoard(false);
                }
                if (e.key === 'Escape') { setAddingBoard(false); setNewBoardName(''); }
              }}
              placeholder="Board name…"
              className="w-full px-2 py-1 text-sm rounded border outline-none"
              style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
        )}
      </div>

      {/* Archive viewer */}
      {state.currentBoardId && (
        <div className="px-3 pb-3">
          <button
            onClick={() => setArchiveOpen(!archiveOpen)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>
            Archive {archiveOpen ? '▾' : '▸'}
          </button>
          {archiveOpen && (
            <div className="mt-1 max-h-40 overflow-y-auto space-y-1">
              {archivedLists.map(l => (
                <div key={l.id} className="flex items-center justify-between px-2 py-1 text-xs rounded" style={{ background: 'var(--active-bg)', color: 'var(--text-secondary)' }}>
                  <span className="truncate">📋 {l.title}</span>
                  <button onClick={() => dispatch({ type: 'RESTORE_LIST', payload: l.id })} className="text-[10px] underline shrink-0 ml-1" style={{ color: 'var(--accent)' }}>Restore</button>
                </div>
              ))}
              {archivedCards.map(c => (
                <div key={c.id} className="flex items-center justify-between px-2 py-1 text-xs rounded" style={{ background: 'var(--active-bg)', color: 'var(--text-secondary)' }}>
                  <span className="truncate">🃏 {c.title}</span>
                  <div className="flex gap-1 shrink-0 ml-1">
                    <button onClick={() => dispatch({ type: 'RESTORE_CARD', payload: c.id })} className="text-[10px] underline" style={{ color: 'var(--accent)' }}>Restore</button>
                    <button onClick={() => dispatch({ type: 'DELETE_CARD', payload: c.id })} className="text-[10px] underline" style={{ color: '#ef4444' }}>Delete</button>
                  </div>
                </div>
              ))}
              {archivedLists.length === 0 && archivedCards.length === 0 && (
                <p className="text-[10px] px-2 py-1" style={{ color: 'var(--text-muted)' }}>Nothing archived</p>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
