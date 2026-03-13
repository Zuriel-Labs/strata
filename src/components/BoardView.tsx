import { useState, useMemo, type DragEvent } from 'react';
import { useAppState, useDispatch } from '../store';
import type { Card as CardType, List as ListType } from '../types';

/* ───── helpers ───── */
function passesFilter(card: CardType, state: ReturnType<typeof useAppState>) {
  if (card.archived) return false;
  if (state.filterLabelIds.length && !state.filterLabelIds.some(id => card.labelIds.includes(id))) return false;
  if (state.filterMemberIds.length && !state.filterMemberIds.some(id => card.memberIds.includes(id))) return false;
  if (state.filterDue !== 'all') {
    const now = Date.now();
    const week = 7 * 86400000;
    const month = 30 * 86400000;
    if (state.filterDue === 'none' && card.dueDate) return false;
    if (state.filterDue === 'overdue' && (!card.dueDate || new Date(card.dueDate).getTime() > now || card.dueDateComplete)) return false;
    if (state.filterDue === 'week' && (!card.dueDate || new Date(card.dueDate).getTime() - now > week)) return false;
    if (state.filterDue === 'month' && (!card.dueDate || new Date(card.dueDate).getTime() - now > month)) return false;
  }
  return true;
}

function dueBadge(card: CardType) {
  if (!card.dueDate) return null;
  const d = new Date(card.dueDate);
  const now = Date.now();
  const diff = d.getTime() - now;
  let bg = 'var(--active-bg)';
  let fg = 'var(--text-muted)';
  if (card.dueDateComplete) { bg = '#22c55e'; fg = '#fff'; }
  else if (diff < 0) { bg = '#ef4444'; fg = '#fff'; }
  else if (diff < 86400000) { bg = '#f59e0b'; fg = '#fff'; }
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: bg, color: fg }}>⏱ {label}</span>;
}

/* ───── Card Component ───── */
function CardItem({ card }: { card: CardType }) {
  const state = useAppState();
  const dispatch = useDispatch();
  const board = state.boards.find(b => b.id === card.boardId);
  const labels = board?.labels.filter(l => card.labelIds.includes(l.id)) || [];
  const members = state.users.filter(u => card.memberIds.includes(u.id));
  const totalItems = card.checklists.reduce((a, c) => a + c.items.length, 0);
  const checkedItems = card.checklists.reduce((a, c) => a + c.items.filter(i => i.completed).length, 0);

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('cardId', card.id); e.dataTransfer.effectAllowed = 'move'; }}
      onClick={() => dispatch({ type: 'SET_ACTIVE_CARD', payload: card.id })}
      className="group rounded-lg p-3 mb-2 cursor-pointer transition-all"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--card-border)')}
    >
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {labels.map(l => (
            <span key={l.id} className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white" style={{ background: l.color }}>{l.name}</span>
          ))}
        </div>
      )}
      <p className="text-sm font-medium leading-snug mb-1.5" style={{ color: 'var(--text-primary)' }}>{card.title}</p>
      <div className="flex items-center gap-2 flex-wrap">
        {dueBadge(card)}
        {card.description && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }} title="Has description">📄</span>}
        {card.comments.length > 0 && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>💬 {card.comments.length}</span>}
        {totalItems > 0 && (
          <span className="text-[10px] font-medium" style={{ color: checkedItems === totalItems ? '#22c55e' : 'var(--text-muted)' }}>
            ☑ {checkedItems}/{totalItems}
          </span>
        )}
        {card.attachments.length > 0 && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>📎 {card.attachments.length}</span>}
        {card.watching && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>👁</span>}
        <span className="flex-1" />
        <div className="flex -space-x-1.5">
          {members.slice(0, 3).map(m => (
            <div key={m.id} className="w-5 h-5 rounded-full text-[8px] font-bold text-white flex items-center justify-center ring-1" style={{ background: m.color, borderColor: 'var(--card-bg)' }} title={m.name}>
              {m.initials}
            </div>
          ))}
          {members.length > 3 && <div className="w-5 h-5 rounded-full text-[8px] font-bold flex items-center justify-center ring-1" style={{ background: 'var(--active-bg)', color: 'var(--text-muted)', borderColor: 'var(--card-bg)' }}>+{members.length - 3}</div>}
        </div>
      </div>
    </div>
  );
}

/* ───── List Component ───── */
function ListColumn({ list }: { list: ListType }) {
  const state = useAppState();
  const dispatch = useDispatch();
  const [addingCard, setAddingCard] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [listTitle, setListTitle] = useState(list.title);
  const [menuOpen, setMenuOpen] = useState(false);

  const cards = useMemo(() =>
    state.cards.filter(c => c.listId === list.id && passesFilter(c, state)).sort((a, b) => a.position - b.position),
    [state.cards, state.filterLabelIds, state.filterMemberIds, state.filterDue, list.id]
  );

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.style.background = 'var(--list-bg)';
    const cardId = e.dataTransfer.getData('cardId');
    const listId = e.dataTransfer.getData('listId');
    if (cardId) {
      dispatch({ type: 'MOVE_CARD', payload: { cardId, toListId: list.id, toPosition: cards.length } });
    } else if (listId && listId !== list.id) {
      const dragList = state.lists.find(l => l.id === listId);
      if (dragList) dispatch({ type: 'MOVE_LIST', payload: { listId, toPosition: list.position } });
    }
  };

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('listId', list.id); }}
      onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = 'var(--list-hover-bg)'; }}
      onDragLeave={e => { e.currentTarget.style.background = 'var(--list-bg)'; }}
      onDrop={handleDrop}
      className="w-72 shrink-0 rounded-xl flex flex-col max-h-full"
      style={{ background: 'var(--list-bg)' }}
    >
      {/* List header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        {editingTitle ? (
          <input
            autoFocus
            value={listTitle}
            onChange={e => setListTitle(e.target.value)}
            onBlur={() => { dispatch({ type: 'UPDATE_LIST', payload: { id: list.id, title: listTitle } }); setEditingTitle(false); }}
            onKeyDown={e => { if (e.key === 'Enter') { dispatch({ type: 'UPDATE_LIST', payload: { id: list.id, title: listTitle } }); setEditingTitle(false); } }}
            className="text-xs font-bold uppercase tracking-widest bg-transparent outline-none flex-1"
            style={{ color: 'var(--text-primary)' }}
          />
        ) : (
          <h3
            onClick={() => { setEditingTitle(true); setListTitle(list.title); }}
            className="text-[11px] font-bold uppercase tracking-widest cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            {list.title} <span className="font-normal">({cards.length})</span>
          </h3>
        )}
        <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)} className="text-xs px-1 rounded hover:opacity-70" style={{ color: 'var(--text-muted)' }}>⋯</button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-36 rounded-lg shadow-xl border z-50 py-1" style={{ background: 'var(--dropdown-bg)', borderColor: 'var(--border)' }}>
              <button onClick={() => { dispatch({ type: 'ARCHIVE_LIST', payload: list.id }); setMenuOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>Archive list</button>
            </div>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-[40px]"
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.stopPropagation();
          const cardId = e.dataTransfer.getData('cardId');
          if (cardId) dispatch({ type: 'MOVE_CARD', payload: { cardId, toListId: list.id, toPosition: cards.length } });
        }}
      >
        {cards.map(c => <CardItem key={c.id} card={c} />)}
      </div>

      {/* Add card */}
      <div className="px-2 pb-2">
        {addingCard ? (
          <div>
            <textarea
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (newTitle.trim()) {
                    dispatch({ type: 'ADD_CARD', payload: { listId: list.id, boardId: list.boardId, title: newTitle.trim() } });
                    setNewTitle('');
                  }
                }
                if (e.key === 'Escape') { setAddingCard(false); setNewTitle(''); }
              }}
              placeholder="Card title…"
              rows={2}
              className="w-full px-2 py-1.5 rounded-lg text-sm outline-none resize-none border"
              style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
            />
            <div className="flex gap-1 mt-1">
              <button
                onClick={() => {
                  if (newTitle.trim()) {
                    dispatch({ type: 'ADD_CARD', payload: { listId: list.id, boardId: list.boardId, title: newTitle.trim() } });
                    setNewTitle('');
                  }
                }}
                className="px-3 py-1 rounded text-xs font-medium text-white"
                style={{ background: 'var(--accent)' }}
              >
                Add
              </button>
              <button onClick={() => { setAddingCard(false); setNewTitle(''); }} className="px-2 py-1 rounded text-xs" style={{ color: 'var(--text-muted)' }}>✕</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingCard(true)}
            className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--active-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            + Add a card
          </button>
        )}
      </div>
    </div>
  );
}

/* ───── Board View ───── */
export function BoardView() {
  const state = useAppState();
  const dispatch = useDispatch();
  const [addingList, setAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');

  const lists = state.lists
    .filter(l => l.boardId === state.currentBoardId && !l.archived)
    .sort((a, b) => a.position - b.position);

  return (
    <div className="flex gap-4 p-4 overflow-x-auto flex-1 items-start" style={{ height: 'calc(100% - 0px)' }}>
      {lists.map(l => <ListColumn key={l.id} list={l} />)}
      {/* Add list */}
      <div className="w-72 shrink-0">
        {addingList ? (
          <div className="rounded-xl p-3" style={{ background: 'var(--list-bg)' }}>
            <input
              autoFocus
              value={newListTitle}
              onChange={e => setNewListTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newListTitle.trim() && state.currentBoardId) {
                  dispatch({ type: 'ADD_LIST', payload: { boardId: state.currentBoardId, title: newListTitle.trim() } });
                  setNewListTitle('');
                }
                if (e.key === 'Escape') { setAddingList(false); setNewListTitle(''); }
              }}
              placeholder="List title…"
              className="w-full px-2 py-1.5 rounded-lg text-sm outline-none border mb-2"
              style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
            />
            <div className="flex gap-1">
              <button
                onClick={() => {
                  if (newListTitle.trim() && state.currentBoardId) {
                    dispatch({ type: 'ADD_LIST', payload: { boardId: state.currentBoardId, title: newListTitle.trim() } });
                    setNewListTitle('');
                  }
                }}
                className="px-3 py-1 rounded text-xs font-medium text-white"
                style={{ background: 'var(--accent)' }}
              >
                Add
              </button>
              <button onClick={() => { setAddingList(false); setNewListTitle(''); }} className="px-2 py-1 text-xs" style={{ color: 'var(--text-muted)' }}>✕</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingList(true)}
            className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition-colors"
            style={{ color: 'var(--text-muted)', background: 'var(--list-bg)' }}
          >
            + Add another list
          </button>
        )}
      </div>
    </div>
  );
}

/* ───── Table View ───── */
export function TableView() {
  const state = useAppState();
  const dispatch = useDispatch();
  const lists = state.lists.filter(l => l.boardId === state.currentBoardId && !l.archived).sort((a, b) => a.position - b.position);
  const board = state.boards.find(b => b.id === state.currentBoardId);
  const allCards = state.cards.filter(c => c.boardId === state.currentBoardId && !c.archived).sort((a, b) => a.position - b.position);

  return (
    <div className="flex-1 overflow-auto p-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            {['Title', 'List', 'Members', 'Labels', 'Due Date', 'Checklist'].map(h => (
              <th key={h} className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allCards.map(c => {
            const list = lists.find(l => l.id === c.listId);
            const labels = board?.labels.filter(l => c.labelIds.includes(l.id)) || [];
            const members = state.users.filter(u => c.memberIds.includes(u.id));
            const total = c.checklists.reduce((a, cl) => a + cl.items.length, 0);
            const done = c.checklists.reduce((a, cl) => a + cl.items.filter(i => i.completed).length, 0);
            return (
              <tr
                key={c.id}
                className="cursor-pointer transition-colors"
                style={{ borderBottom: '1px solid var(--border)' }}
                onClick={() => dispatch({ type: 'SET_ACTIVE_CARD', payload: c.id })}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--active-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-primary)' }}>{c.title}</td>
                <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{list?.title}</td>
                <td className="px-3 py-2">
                  <div className="flex -space-x-1">{members.map(m => <div key={m.id} className="w-5 h-5 rounded-full text-[8px] font-bold text-white flex items-center justify-center" style={{ background: m.color }}>{m.initials}</div>)}</div>
                </td>
                <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{labels.map(l => <span key={l.id} className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white" style={{ background: l.color }}>{l.name}</span>)}</div></td>
                <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{c.dueDate ? new Date(c.dueDate).toLocaleDateString() : '—'}</td>
                <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>{total > 0 ? `${done}/${total}` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ───── Calendar View ───── */
export function CalendarView() {
  const state = useAppState();
  const dispatch = useDispatch();
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  const first = new Date(month.y, month.m, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const cells: (number | null)[] = Array(startDay).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));

  const cardsWithDue = state.cards.filter(c => c.boardId === state.currentBoardId && !c.archived && c.dueDate);

  const prev = () => setMonth(p => p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 });
  const next = () => setMonth(p => p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 });

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex items-center gap-4 mb-4">
        <button onClick={prev} className="text-sm px-2 py-1 rounded" style={{ color: 'var(--text-secondary)' }}>◀</button>
        <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
        <button onClick={next} className="text-sm px-2 py-1 rounded" style={{ color: 'var(--text-secondary)' }}>▶</button>
      </div>
      <div className="grid grid-cols-7 gap-px rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-[10px] font-bold uppercase text-center py-1.5" style={{ background: 'var(--list-bg)', color: 'var(--text-muted)' }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          const dateStr = day ? new Date(month.y, month.m, day).toDateString() : '';
          const dayCards = cardsWithDue.filter(c => c.dueDate && new Date(c.dueDate).toDateString() === dateStr);
          return (
            <div key={i} className="min-h-[80px] p-1 border-t" style={{ borderColor: 'var(--border)', background: day ? 'var(--card-bg)' : 'var(--list-bg)' }}>
              {day && <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{day}</span>}
              {dayCards.slice(0, 2).map(c => (
                <div key={c.id} onClick={() => dispatch({ type: 'SET_ACTIVE_CARD', payload: c.id })} className="text-[10px] truncate px-1 py-0.5 rounded mt-0.5 cursor-pointer" style={{ background: 'var(--accent)', color: '#fff' }}>{c.title}</div>
              ))}
              {dayCards.length > 2 && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>+{dayCards.length - 2}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
