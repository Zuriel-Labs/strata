import { useRef, useEffect, useMemo } from 'react';
import { useAppState, useDispatch } from '../store';

export function SearchOverlay() {
  const state = useAppState();
  const dispatch = useDispatch();
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.searchOpen) inputRef.current?.focus();
  }, [state.searchOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); dispatch({ type: 'SET_SEARCH_OPEN', payload: !state.searchOpen }); }
      if (e.key === 'Escape' && state.searchOpen) dispatch({ type: 'SET_SEARCH_OPEN', payload: false });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.searchOpen]);

  const results = useMemo(() => {
    const q = state.searchQuery.toLowerCase().trim();
    if (!q) return [];

    let cards = state.cards.filter(c => !c.archived);

    // Parse operators
    const tokens = q.split(/\s+/);
    let textParts: string[] = [];

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
        cards = cards.filter(c => c.dueDate && new Date(c.dueDate).getTime() < Date.now() && !c.dueDateComplete);
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
  }, [state.searchQuery, state.cards, state.users, state.boards]);

  if (!state.searchOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) dispatch({ type: 'SET_SEARCH_OPEN', payload: false }); }}
      className="fixed inset-0 z-50 flex items-start justify-center pt-20"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div className="w-full max-w-lg rounded-xl shadow-2xl border overflow-hidden" style={{ background: 'var(--modal-bg)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)' }}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            ref={inputRef}
            value={state.searchQuery}
            onChange={e => dispatch({ type: 'SET_SEARCH_QUERY', payload: e.target.value })}
            placeholder="Search cards… (try @name, #label, is:overdue)"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
          <kbd className="text-[9px] px-1.5 py-0.5 rounded border font-mono" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>ESC</kbd>
        </div>

        {state.searchQuery.trim() && (
          <div className="max-h-80 overflow-y-auto">
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
                      {new Date(c.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
            <div className="grid grid-cols-2 gap-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              <span><code className="px-1 py-0.5 rounded" style={{ background: 'var(--active-bg)' }}>@name</code> Filter by member</span>
              <span><code className="px-1 py-0.5 rounded" style={{ background: 'var(--active-bg)' }}>#label</code> Filter by label</span>
              <span><code className="px-1 py-0.5 rounded" style={{ background: 'var(--active-bg)' }}>is:overdue</code> Overdue cards</span>
              <span><code className="px-1 py-0.5 rounded" style={{ background: 'var(--active-bg)' }}>is:watching</code> Watched cards</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
