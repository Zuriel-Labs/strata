import { useRef, useEffect, useMemo } from 'react';
import { useAppState, useDispatch } from '../store';
import { compareDateOnlyToToday, formatDateOnly, todayDateOnly } from '../lib/date-only';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

export function SearchOverlay() {
  const state = useAppState();
  const dispatch = useDispatch();
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      const target = e.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        dispatch({ type: 'SET_SEARCH_OPEN', payload: !state.searchOpen });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch, state.searchOpen]);

  const results = useMemo(() => {
    const q = state.searchQuery.toLowerCase().trim();
    if (!q) return [];

    let cards = state.cards.filter(c => !c.archived);

    // Parse operators
    const tokens = q.split(/\s+/);
    const textParts: string[] = [];

    for (const token of tokens) {
      if (token.startsWith('@')) {
        const name = token.slice(1);
        const user = state.users.find(u => u.name.toLowerCase().includes(name));
        if (user) cards = cards.filter(c => c.memberIds.includes(user.id));
      } else if (token.startsWith('#')) {
        const labelName = token.slice(1);
        const boardLabels = state.boards.flatMap(b => b.labels);
        const label = boardLabels.find(l => l.name.toLowerCase().includes(labelName));
        if (label) cards = cards.filter(c => c.labelIds.includes(label.id));
      } else if (token === 'is:overdue') {
        cards = cards.filter(c => c.dueDate && compareDateOnlyToToday(c.dueDate, todayDateOnly(new Date(state.searchTimestamp))) === -1 && !c.dueDateComplete);
      } else if (token === 'is:open') {
        cards = cards.filter(c => !c.archived);
      } else if (token === 'is:watching') {
        cards = cards.filter(c => c.watching);
      } else {
        textParts.push(token);
      }
    }

    const freeText = textParts.join(' ');
    if (freeText) {
      cards = cards.filter(c => c.title.toLowerCase().includes(freeText) || c.description.toLowerCase().includes(freeText));
    }

    return cards.slice(0, 20);
  }, [state.searchQuery, state.searchTimestamp, state.cards, state.users, state.boards]);

  return (
    <Dialog open={state.searchOpen} onOpenChange={open => dispatch({ type: 'SET_SEARCH_OPEN', payload: open })}>
      <DialogContent
        className="top-20 translate-y-0 w-[calc(100%-1.5rem)] max-h-[calc(100dvh-6rem)] gap-0 overflow-y-auto rounded-xl p-0 shadow-2xl"
        style={{ background: 'var(--modal-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        onOpenAutoFocus={event => {
          returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
        }}
      >
        <DialogTitle className="sr-only">Search cards</DialogTitle>
        <DialogDescription className="sr-only">Open search with Control or Command K outside text fields. Press Escape to close. Tab through results, then press Enter to open a card.</DialogDescription>
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)' }}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            ref={inputRef}
            aria-label="Search cards"
            value={state.searchQuery}
            onChange={e => dispatch({ type: 'SET_SEARCH_QUERY', payload: e.target.value })}
            placeholder="Search cards… (try @name, #label, is:overdue)"
            className="min-w-0 flex-1 bg-transparent text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
          <kbd className="mr-8 text-[9px] px-1.5 py-0.5 rounded border font-mono" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>ESC</kbd>
        </div>

        {state.searchQuery.trim() && (
          <div className="max-h-80 overflow-y-auto" aria-live="polite">
            {results.length === 0 && (
              <p className="text-sm p-4" style={{ color: 'var(--text-muted)' }}>No cards found</p>
            )}
            {results.map(c => {
              const board = state.boards.find(b => b.id === c.boardId);
              const list = state.lists.find(l => l.id === c.listId);
              const labels = board?.labels.filter(l => c.labelIds.includes(l.id)) || [];
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    dispatch({ type: 'SET_CURRENT_BOARD', payload: c.boardId });
                    dispatch({ type: 'SET_ACTIVE_CARD', payload: c.id });
                    dispatch({ type: 'SET_SEARCH_OPEN', payload: false });
                  }}
                  className="w-full text-left px-4 py-3 border-b transition-colors flex items-start gap-3"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--active-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.title}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {board?.title} › {list?.title}
                    </p>
                    {labels.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {labels.map(l => <span key={l.id} className="px-1 py-0.5 rounded text-[8px] font-bold text-white" style={{ background: l.color }}>{l.name}</span>)}
                      </div>
                    )}
                  </div>
                  {c.dueDate && (
                    <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {formatDateOnly(c.dueDate, { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {!state.searchQuery.trim() && (
          <div className="p-4">
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Search operators:</p>
            <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>Ctrl/Cmd+K opens search outside text fields. Escape closes it. Tab to a result, then Enter to open.</p>
            <div className="grid grid-cols-2 gap-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              <span><code className="px-1 py-0.5 rounded" style={{ background: 'var(--active-bg)' }}>@name</code> Filter by member</span>
              <span><code className="px-1 py-0.5 rounded" style={{ background: 'var(--active-bg)' }}>#label</code> Filter by label</span>
              <span><code className="px-1 py-0.5 rounded" style={{ background: 'var(--active-bg)' }}>is:overdue</code> Overdue cards</span>
              <span><code className="px-1 py-0.5 rounded" style={{ background: 'var(--active-bg)' }}>is:watching</code> Watched cards</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
