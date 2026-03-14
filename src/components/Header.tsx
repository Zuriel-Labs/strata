import { useState, useRef, useEffect } from 'react';
import { useAppState, useDispatch } from '../store';
import { useAuth } from '../lib/auth-context';
import { markNotificationReadApi, markAllNotificationsReadApi } from '../services/data';
import { NavigationOverlay } from './NavigationOverlay';
import { ProfileOverlay } from './ProfileOverlay';

export function Header() {
  const state = useAppState();
  const dispatch = useDispatch();
  const auth = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const currentUserNotifications = state.notifications.filter(n => n.userId === state.currentUserId);

  const board = state.boards.find(b => b.id === state.currentBoardId);
  const currentWs = state.workspaces.find(w => w.id === state.currentWorkspaceId);
  const wsBoards = state.boards.filter(b => b.workspaceId === state.currentWorkspaceId);
  const hasMultipleWorkspaces = state.workspaces.length > 1;
  const unreadCount = currentUserNotifications.filter(n => !n.read).length;
  const dueFilterOptions: Array<[typeof state.filterDue, string]> = [['all', 'Any'], ['overdue', 'Overdue'], ['week', 'This Week'], ['month', 'This Month'], ['none', 'No Date']];

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
    <>
      <header className="shrink-0 border-b" style={{ borderColor: 'var(--border)', background: 'var(--header-bg)' }}>
        {/* Row 1: Workspace / Board centered */}
        <div className="h-10 flex items-center justify-center px-4">
          <div className="flex items-center gap-1.5">
            {hasMultipleWorkspaces ? (
              <select
                value={state.currentWorkspaceId || ''}
                onChange={e => dispatch({ type: 'SET_CURRENT_WORKSPACE', payload: e.target.value })}
                className="bg-transparent text-sm font-bold outline-none cursor-pointer truncate max-w-[200px]"
                style={{ color: 'var(--text-primary)' }}
              >
                {state.workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            ) : (
              <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{currentWs?.name}</span>
            )}

            {board && (
              <>
                <span className="text-sm shrink-0" style={{ color: 'var(--text-muted)' }}>—</span>
                {wsBoards.length > 1 ? (
                  <select
                    value={state.currentBoardId || ''}
                    onChange={e => dispatch({ type: 'SET_CURRENT_BOARD', payload: e.target.value })}
                    className="bg-transparent text-sm font-semibold outline-none cursor-pointer truncate max-w-[200px]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {wsBoards.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                  </select>
                ) : (
                  <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>{board.title}</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Row 2: All actions */}
        <div className="h-10 flex items-center justify-between px-4 border-t" style={{ borderColor: 'var(--border)' }}>
          {/* Left: Hamburger */}
          <button aria-label="Open navigation" onClick={() => setNavOpen(true)} className="w-8 h-8 rounded-md flex items-center justify-center hover:opacity-70 transition-opacity shrink-0" style={{ color: 'var(--text-secondary)', background: 'var(--active-bg)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>

          {/* Center/Right: View, Filter, Search, Notifications, Admin, Profile */}
          <div className="flex items-center gap-1.5">
            {/* View switcher */}
            {board && (
              <select
                value={state.viewMode}
                onChange={e => dispatch({ type: 'SET_VIEW_MODE', payload: e.target.value as 'board' | 'table' | 'calendar' })}
                className="rounded-md px-2 h-8 text-[11px] font-medium capitalize cursor-pointer outline-none border"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
              >
                {(['board', 'table', 'calendar'] as const).map(v => (
                  <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                ))}
              </select>
            )}

            {/* Filter */}
            {board && (
              <div className="relative" ref={filterRef}>
                <button
                  onClick={() => setFilterOpen(!filterOpen)}
                  aria-label="Filter"
                  className="w-8 h-8 rounded-md flex items-center justify-center transition-colors relative"
                  style={{ color: activeFilters > 0 ? 'var(--accent)' : 'var(--text-secondary)', background: 'var(--active-bg)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
                  {activeFilters > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[9px] text-white flex items-center justify-center font-bold">{activeFilters}</span>
                  )}
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
                        className="px-2.5 min-h-[44px] flex items-center rounded-full text-[10px] font-medium text-white transition-opacity"
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
                        className="w-11 h-11 rounded-full text-xs font-bold text-white transition-opacity"
                        style={{ background: u.color, opacity: state.filterMemberIds.includes(u.id) ? 1 : 0.4 }}
                        title={u.name}
                      >
                        {u.initials}
                      </button>
                    ))}
                  </div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Due Date</h4>
                  <div className="flex flex-wrap gap-1 mb-2">
                     {dueFilterOptions.map(([val, label]) => (
                       <button
                         key={val}
                         onClick={() => dispatch({ type: 'SET_FILTER_DUE', payload: val })}
                         className="px-2.5 min-h-[44px] flex items-center rounded text-[10px] font-medium transition-colors"
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
                      className="text-xs underline min-h-[44px] flex items-center"
                      style={{ color: 'var(--accent)' }}
                    >
                      Clear all filters
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Search */}
          <button
            aria-label="Open search"
            onClick={() => dispatch({ type: 'SET_SEARCH_OPEN', payload: true })}
            className="w-8 h-8 rounded-md flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-secondary)', background: 'var(--active-bg)' }}
            title="Search (Ctrl+K)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          </button>

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              aria-label="Open notifications"
              onClick={() => setNotifOpen(!notifOpen)}
              className="w-8 h-8 rounded-md flex items-center justify-center transition-colors relative"
              style={{ color: 'var(--text-secondary)', background: 'var(--active-bg)' }}
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
                    <button onClick={() => { dispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' }); markAllNotificationsReadApi(); }} className="text-xs min-h-[44px] flex items-center" style={{ color: 'var(--accent)' }}>Mark all read</button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto">
                   {currentUserNotifications.length === 0 && <p className="text-xs p-3" style={{ color: 'var(--text-muted)' }}>No notifications</p>}
                   {currentUserNotifications.slice().reverse().map(n => (
                    <button
                      key={n.id}
                      onClick={() => {
                        dispatch({ type: 'MARK_NOTIFICATION_READ', payload: n.id });
                        markNotificationReadApi(n.id);
                        dispatch({ type: 'SET_ACTIVE_CARD', payload: n.cardId });
                        const card = state.cards.find(c => c.id === n.cardId);
                        if (card) dispatch({ type: 'SET_CURRENT_BOARD', payload: card.boardId });
                        setNotifOpen(false);
                      }}
                      className="w-full text-left px-3 min-h-[44px] flex items-start border-b transition-colors text-xs"
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

          {/* Admin */}
          {auth.session?.permissions.isSystemAdmin && (
            <button
              aria-label="Open admin panel"
              onClick={() => auth.setAdminOpen(true)}
              className="px-2.5 h-8 flex items-center rounded text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: '#0f1820', background: '#e2a56a' }}
            >
              Admin
            </button>
          )}

          {/* Profile avatar */}
          <button
            aria-label="Open profile menu"
            onClick={() => setProfileOpen(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white cursor-pointer shrink-0"
            style={{ background: auth.session?.user.color ?? '#6366f1' }}
            title={auth.session?.user.username}
          >
            {auth.session?.user.initials ?? 'SA'}
          </button>
          </div>
        </div>
      </header>

      <NavigationOverlay open={navOpen} onClose={() => setNavOpen(false)} />
      <ProfileOverlay open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}
