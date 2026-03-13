import React, { useState, useRef, useEffect } from 'react';
import { useAppState, useDispatch } from '../store';

export function Header() {
  const state = useAppState();
  const dispatch = useDispatch();
  const [notifOpen, setNotifOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const board = state.boards.find(b => b.id === state.currentBoardId);
  const unreadCount = state.notifications.filter(n => !n.read).length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeFilters = state.filterLabelIds.length + state.filterMemberIds.length + (state.filterDue !== 'all' ? 1 : 0);

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--header-bg)' }}>
      <div className="flex items-center gap-3">
        <button onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })} className="p-1 rounded hover:opacity-70 transition-opacity" style={{ color: 'var(--text-secondary)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
        </button>
        {board && (
          <>
            <h1 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{board.title}</h1>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide" style={{ background: 'var(--active-bg)', color: 'var(--text-muted)' }}>
              {board.visibility}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* View switcher */}
        {board && (
          <div className="flex rounded-md overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            {(['board', 'table', 'calendar'] as const).map(v => (
              <button
                key={v}
                onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: v })}
                className="px-2.5 py-1 text-[11px] font-medium transition-colors capitalize"
                style={{
                  background: state.viewMode === v ? 'var(--accent)' : 'transparent',
                  color: state.viewMode === v ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {v}
              </button>
            ))}
          </div>
        )}

        {/* Filter */}
        {board && (
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
              style={{ color: activeFilters > 0 ? 'var(--accent)' : 'var(--text-secondary)', background: activeFilters > 0 ? 'var(--active-bg)' : 'transparent' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
              Filter{activeFilters > 0 && ` (${activeFilters})`}
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 w-64 rounded-lg shadow-xl border p-3 z-50" style={{ background: 'var(--dropdown-bg)', borderColor: 'var(--border)' }}>
                <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Labels</h4>
                <div className="flex flex-wrap gap-1 mb-3">
                  {board.labels.map(lb => (
                    <button
                      key={lb.id}
                      onClick={() => {
                        const ids = state.filterLabelIds.includes(lb.id) ? state.filterLabelIds.filter(x => x !== lb.id) : [...state.filterLabelIds, lb.id];
                        dispatch({ type: 'SET_FILTER_LABELS', payload: ids });
                      }}
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white transition-opacity"
                      style={{ background: lb.color, opacity: state.filterLabelIds.includes(lb.id) ? 1 : 0.4 }}
                    >
                      {lb.name}
                    </button>
                  ))}
                </div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Members</h4>
                <div className="flex flex-wrap gap-1 mb-3">
                  {state.users.map(u => (
                    <button
                      key={u.id}
                      onClick={() => {
                        const ids = state.filterMemberIds.includes(u.id) ? state.filterMemberIds.filter(x => x !== u.id) : [...state.filterMemberIds, u.id];
                        dispatch({ type: 'SET_FILTER_MEMBERS', payload: ids });
                      }}
                      className="w-7 h-7 rounded-full text-[10px] font-bold text-white transition-opacity"
                      style={{ background: u.color, opacity: state.filterMemberIds.includes(u.id) ? 1 : 0.4 }}
                      title={u.name}
                    >
                      {u.initials}
                    </button>
                  ))}
                </div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Due Date</h4>
                <div className="flex flex-wrap gap-1 mb-2">
                  {[['all', 'Any'], ['overdue', 'Overdue'], ['week', 'This Week'], ['month', 'This Month'], ['none', 'No Date']] .map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => dispatch({ type: 'SET_FILTER_DUE', payload: val as any })}
                      className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                      style={{
                        background: state.filterDue === val ? 'var(--accent)' : 'var(--active-bg)',
                        color: state.filterDue === val ? '#fff' : 'var(--text-secondary)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {activeFilters > 0 && (
                  <button
                    onClick={() => { dispatch({ type: 'SET_FILTER_LABELS', payload: [] }); dispatch({ type: 'SET_FILTER_MEMBERS', payload: [] }); dispatch({ type: 'SET_FILTER_DUE', payload: 'all' }); }}
                    className="text-[10px] underline mt-1"
                    style={{ color: 'var(--accent)' }}
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Automation */}
        {board && (
          <button
            onClick={() => dispatch({ type: 'SET_AUTOMATION_PANEL', payload: !state.automationPanelOpen })}
            className="p-1.5 rounded transition-colors"
            style={{ color: state.automationPanelOpen ? 'var(--accent)' : 'var(--text-secondary)' }}
            title="Automations"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </button>
        )}

        {/* Search */}
        <button
          onClick={() => dispatch({ type: 'SET_SEARCH_OPEN', payload: true })}
          className="p-1.5 rounded transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          title="Search (Ctrl+K)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="p-1.5 rounded transition-colors relative"
            style={{ color: 'var(--text-secondary)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[9px] text-white flex items-center justify-center font-bold">{unreadCount}</span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-1 w-80 rounded-lg shadow-xl border z-50 overflow-hidden" style={{ background: 'var(--dropdown-bg)', borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Notifications</h3>
                {unreadCount > 0 && (
                  <button onClick={() => dispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' })} className="text-[10px]" style={{ color: 'var(--accent)' }}>Mark all read</button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {state.notifications.length === 0 && <p className="text-xs p-3" style={{ color: 'var(--text-muted)' }}>No notifications</p>}
                {state.notifications.slice().reverse().map(n => (
                  <button
                    key={n.id}
                    onClick={() => {
                      dispatch({ type: 'MARK_NOTIFICATION_READ', payload: n.id });
                      dispatch({ type: 'SET_ACTIVE_CARD', payload: n.cardId });
                      const card = state.cards.find(c => c.id === n.cardId);
                      if (card) dispatch({ type: 'SET_CURRENT_BOARD', payload: card.boardId });
                      setNotifOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 border-b text-xs transition-colors"
                    style={{
                      borderColor: 'var(--border)',
                      background: n.read ? 'transparent' : 'var(--active-bg)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <p style={{ color: n.read ? 'var(--text-muted)' : 'var(--text-primary)' }}>{n.message}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{new Date(n.createdAt).toLocaleDateString()}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User avatar */}
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: '#6366f1' }}>
          YO
        </div>
      </div>
    </header>
  );
}
