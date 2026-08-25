import { useMemo, useRef, useState, type ComponentProps } from 'react';
import { DragDropProvider, DragOverlay, useDroppable } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move as moveSortable } from '@dnd-kit/helpers';
import { PointerSensor } from '@dnd-kit/dom';
import { useAppState, useDispatch } from '../store';
import { useAuth } from '../lib/auth-context';
import type { Card as CardType, List as ListType } from '../types';
import { createCardApi, moveCardApi, createListApi, updateListApi, archiveListApi, moveListApi, sortListApi } from '../services/data';
import { completeInsertionPosition } from '../lib/card-order';
import { sortCardsByTitle, type CardSortDirection } from '../lib/card-sort';
import { useToast } from '../hooks/use-toast';

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
function CardContents({ card }: { card: CardType }) {
  const state = useAppState();
  const board = state.boards.find(b => b.id === card.boardId);
  const labels = board?.labels.filter(l => card.labelIds.includes(l.id)) || [];
  const members = state.users.filter(u => card.memberIds.includes(u.id));
  const totalItems = card.checklists.reduce((a, c) => a + c.items.length, 0);
  const checkedItems = card.checklists.reduce((a, c) => a + c.items.filter(i => i.completed).length, 0);

  return <>
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {labels.map(label => {
            const isColorOnly = label.name.trim().length === 0;
            return (
              <span
                key={label.id}
                title={isColorOnly ? 'Color-only label' : label.name}
                className={isColorOnly ? 'h-4 w-4 rounded text-[9px] font-bold' : 'px-1.5 py-0.5 rounded text-[9px] font-bold text-white'}
                style={{ background: label.color }}
              >
                {!isColorOnly ? label.name : null}
              </span>
            );
          })}
        </div>
      )}
      <p className="text-sm font-medium leading-snug mb-1.5 pr-7" style={{ color: 'var(--text-primary)' }}>{card.title}</p>
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
    </>;
}

function StaticCardItem({ card }: { card: CardType }) {
  const dispatch = useDispatch();
  return (
    <div
      data-card-id={card.id}
      onClick={() => dispatch({ type: 'SET_ACTIVE_CARD', payload: card.id })}
      className="group relative rounded-lg p-3 mb-2 cursor-pointer transition-[border-color,box-shadow,opacity] duration-200"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
    >
      <CardContents card={card} />
    </div>
  );
}

function SortableCardItem({ card, index, group, shouldSuppressOpen }: { card: CardType; index: number; group: string; shouldSuppressOpen: (cardId: string) => boolean }) {
  const dispatch = useDispatch();
  const { ref, isDragSource, isDropTarget } = useSortable({
    id: card.id,
    index,
    group,
    type: 'card',
    accept: 'card',
    data: { cardId: card.id, listId: group },
    sensors: [PointerSensor],
    transition: { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', idle: true },
  });

  return (
    <div
      ref={ref}
      data-card-id={card.id}
      data-drag-activator="card"
      onClick={() => {
        if (shouldSuppressOpen(card.id)) return;
        dispatch({ type: 'SET_ACTIVE_CARD', payload: card.id });
      }}
      className="group relative rounded-lg p-3 mb-2 cursor-grab active:cursor-grabbing touch-manipulation select-none transition-[border-color,box-shadow,opacity] duration-200"
      style={{
        background: 'var(--card-bg)',
        border: `1px solid ${isDropTarget ? 'var(--accent)' : 'var(--card-border)'}`,
        boxShadow: isDropTarget ? '0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent)' : undefined,
        opacity: isDragSource ? 0.28 : 1,
      }}
      onMouseEnter={event => { if (!isDropTarget) event.currentTarget.style.borderColor = 'var(--accent)'; }}
      onMouseLeave={event => { if (!isDropTarget) event.currentTarget.style.borderColor = 'var(--card-border)'; }}
    >
      <CardContents card={card} />
    </div>
  );
}

function CardItem({ card, index, group, canReorder, shouldSuppressOpen }: { card: CardType; index: number; group: string; canReorder: boolean; shouldSuppressOpen: (cardId: string) => boolean }) {
  return canReorder
    ? <SortableCardItem card={card} index={index} group={group} shouldSuppressOpen={shouldSuppressOpen} />
    : <StaticCardItem card={card} />;
}

function CardOverlay({ card }: { card: CardType }) {
  return (
    <div
      className="rounded-lg p-3 w-72 rotate-1"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--accent)', boxShadow: '0 18px 42px rgb(0 0 0 / 35%)' }}
      aria-hidden="true"
    >
      <CardContents card={card} />
    </div>
  );
}

/* ───── List Component ───── */
function ListColumn({ list, cards, shouldSuppressOpen }: { list: ListType; cards: CardType[]; shouldSuppressOpen: (cardId: string) => boolean }) {
  const state = useAppState();
  const dispatch = useDispatch();
  const auth = useAuth();
  const [addingCard, setAddingCard] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [listTitle, setListTitle] = useState(list.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortPending, setSortPending] = useState<CardSortDirection | null>(null);
  const [sortStatus, setSortStatus] = useState('');
  const canEditCards = auth.canEditBoardCards(list.boardId);
  const canArchiveContent = auth.canArchiveBoardContent(list.boardId);
  const { toast } = useToast();
  const { ref: dropRef, isDropTarget } = useDroppable({ id: list.id, type: 'card-list', accept: 'card', disabled: !canEditCards });

  const submitCard = () => {
    const title = newTitle.trim();
    if (!title) {
      setAddingCard(false);
      setNewTitle('');
      return;
    }
    void createCardApi({ listId: list.id, boardId: list.boardId, title }).then(card => {
      dispatch({ type: 'ADD_CARD_FROM_API', payload: card });
      setNewTitle('');
      setAddingCard(false);
    });
  };

  const sortCards = (direction: CardSortDirection) => {
    if (sortPending || !canEditCards) return;
    const snapshot = state.cards;
    const activeListCards = state.cards.filter(card => card.listId === list.id && !card.archived);
    const optimisticCards = sortCardsByTitle(activeListCards, direction).map((card, position) => ({ ...card, position }));
    const directionLabel = direction === 'asc' ? 'A to Z' : 'Z to A';

    setMenuOpen(false);
    setSortPending(direction);
    setSortStatus(`Sorting ${list.title} ${directionLabel}.`);
    dispatch({ type: 'APPLY_SORTED_LIST_CARDS', payload: { listId: list.id, cards: optimisticCards } });
    void sortListApi(list.id, direction).then(result => {
      dispatch({ type: 'APPLY_SORTED_LIST_CARDS', payload: { listId: result.listId, cards: result.cards } });
      setSortStatus(`Sorted ${list.title} ${directionLabel}.`);
      setMenuOpen(false);
    }).catch(error => {
      dispatch({ type: 'RESTORE_CARDS', payload: snapshot });
      const message = error instanceof Error ? error.message : 'Unable to save the sorted card order.';
      setSortStatus(`Could not sort ${list.title}. The previous order was restored.`);
      toast({ title: 'List order not saved', description: message, variant: 'destructive' });
    }).finally(() => setSortPending(null));
  };

  return (
    <div
      ref={dropRef}
      data-list-id={list.id}
      className="w-72 shrink-0 rounded-xl flex flex-col max-h-full"
      style={{ background: isDropTarget ? 'var(--list-hover-bg)' : 'var(--list-bg)' }}
    >
      {/* List header */}
      <div
        className="flex items-center justify-between px-3 pt-3 pb-1"
        draggable={canEditCards}
        onDragStart={event => { event.dataTransfer.setData('listId', list.id); event.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={event => {
          const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-list-id]');
          const toList = target ? state.lists.find(candidate => candidate.id === target.dataset.listId) : null;
          if (toList && toList.id !== list.id) {
            dispatch({ type: 'MOVE_LIST', payload: { listId: list.id, toPosition: toList.position } });
            void moveListApi(list.id, toList.position);
          }
        }}
      >
        {editingTitle ? (
          <input
            autoFocus
            value={listTitle}
            onChange={e => setListTitle(e.target.value)}
            onBlur={() => { dispatch({ type: 'UPDATE_LIST', payload: { id: list.id, title: listTitle } }); updateListApi(list.id, { title: listTitle }); setEditingTitle(false); }}
            onKeyDown={e => { if (e.key === 'Enter') { dispatch({ type: 'UPDATE_LIST', payload: { id: list.id, title: listTitle } }); updateListApi(list.id, { title: listTitle }); setEditingTitle(false); } }}
            className="text-xs font-bold uppercase tracking-widest bg-transparent outline-none flex-1"
            style={{ color: 'var(--text-primary)' }}
          />
        ) : (
          <h3
            onClick={() => {
              if (!canEditCards) return;
              setEditingTitle(true);
              setListTitle(list.title);
            }}
            className={`text-[11px] font-bold uppercase tracking-widest ${canEditCards ? 'cursor-pointer' : ''}`}
            style={{ color: 'var(--text-muted)' }}
          >
            {list.title} <span className="font-normal">({cards.length})</span>
          </h3>
        )}
        <div className="relative">
          {(canEditCards || canArchiveContent) && <button type="button" disabled={Boolean(sortPending)} aria-label={`List actions for ${list.title}`} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} className="w-8 h-8 rounded-md flex items-center justify-center text-sm hover:opacity-70 disabled:opacity-50" style={{ color: 'var(--text-muted)', background: 'var(--active-bg)' }}>⋯</button>}
          {menuOpen && (
            <div aria-busy={Boolean(sortPending)} className="absolute right-0 top-full mt-1 w-40 rounded-lg shadow-xl border z-50 py-1" style={{ background: 'var(--dropdown-bg)', borderColor: 'var(--border)' }}>
              {canEditCards && <>
                <button type="button" disabled={Boolean(sortPending)} onClick={() => sortCards('asc')} className="w-full text-left px-3 min-h-[44px] flex items-center text-xs hover:opacity-70 disabled:opacity-50" style={{ color: 'var(--text-secondary)' }}>Sort A to Z</button>
                <button type="button" disabled={Boolean(sortPending)} onClick={() => sortCards('desc')} className="w-full text-left px-3 min-h-[44px] flex items-center text-xs hover:opacity-70 disabled:opacity-50" style={{ color: 'var(--text-secondary)' }}>Sort Z to A</button>
              </>}
              {canEditCards && canArchiveContent && <div role="separator" className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />}
              {canArchiveContent && <button type="button" disabled={Boolean(sortPending)} onClick={() => { dispatch({ type: 'ARCHIVE_LIST', payload: list.id }); void archiveListApi(list.id); setMenuOpen(false); }} className="w-full text-left px-3 min-h-[44px] flex items-center text-xs hover:opacity-70 disabled:opacity-50" style={{ color: 'var(--text-secondary)' }}>Archive list</button>}
            </div>
          )}
          <div className="sr-only" aria-live="polite" aria-atomic="true">{sortStatus}</div>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-[40px]">
        {cards.map((card, index) => <CardItem key={card.id} card={card} index={index} group={list.id} canReorder={canEditCards} shouldSuppressOpen={shouldSuppressOpen} />)}
      </div>

      {/* Add card */}
      <div className="px-2 pb-2">
        {canEditCards && (addingCard ? (
          <div>
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onBlur={submitCard}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitCard();
                }
                if (e.key === 'Escape') { setAddingCard(false); setNewTitle(''); }
              }}
              placeholder="Card title…"
              className="w-full px-2 py-2 rounded-lg text-sm outline-none border"
              style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
            />
          </div>
        ) : (
          <button
            onClick={() => setAddingCard(true)}
            className="w-full text-left px-2 min-h-[44px] flex items-center rounded-lg text-xs font-medium transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--active-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            + Add a card
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───── Board View ───── */
export function BoardView() {
  const state = useAppState();
  const dispatch = useDispatch();
  const auth = useAuth();
  const { toast } = useToast();
  const [addingList, setAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [dragAnnouncement, setDragAnnouncement] = useState('');
  const dragSnapshot = useRef<{ cards: CardType[]; notifications: typeof state.notifications } | null>(null);
  const suppressOpenCardId = useRef<string | null>(null);
  const canManageBoard = auth.canManageBoard(state.currentBoardId);

  const lists = state.lists
    .filter(l => l.boardId === state.currentBoardId && !l.archived)
    .sort((a, b) => a.position - b.position);

  const visibleCardsByList = useMemo(() => Object.fromEntries(lists.map(list => [
    list.id,
    state.cards
      .filter(card => card.listId === list.id && passesFilter(card, state))
      .sort((left, right) => left.position - right.position),
  ])) as Record<string, CardType[]>, [lists, state]);
  const visibleGroups = useMemo(() => Object.fromEntries(Object.entries(visibleCardsByList).map(([listId, cards]) => [
    listId,
    cards.map(card => card.id),
  ])) as Record<string, string[]>, [visibleCardsByList]);
  const activeCard = activeCardId ? state.cards.find(card => card.id === activeCardId) ?? null : null;

  const submitList = () => {
    const title = newListTitle.trim();
    if (!title || !state.currentBoardId) {
      setAddingList(false);
      setNewListTitle('');
      return;
    }

    void createListApi({ boardId: state.currentBoardId, title }).then(list => {
      dispatch({ type: 'ADD_LIST_FROM_API', payload: list });
      setNewListTitle('');
      setAddingList(false);
    });
  };

  const handleDragEnd = (event: Parameters<NonNullable<ComponentProps<typeof DragDropProvider>['onDragEnd']>>[0]) => {
    const cardId = String(event.operation.source?.id ?? '');
    const movingCard = state.cards.find(card => card.id === cardId);
    setActiveCardId(null);
    window.setTimeout(() => {
      if (suppressOpenCardId.current === cardId) suppressOpenCardId.current = null;
    }, 0);
    if (!movingCard || event.canceled) {
      dragSnapshot.current = null;
      setDragAnnouncement(event.canceled && movingCard ? `Canceled moving ${movingCard.title}.` : '');
      return;
    }

    const nextGroups = moveSortable(visibleGroups, event) as Record<string, string[]>;
    const toListId = Object.keys(nextGroups).find(listId => nextGroups[listId].includes(cardId));
    if (!toListId) {
      dragSnapshot.current = null;
      setDragAnnouncement(`Canceled moving ${movingCard.title}; no valid destination was found.`);
      return;
    }

    let toPosition: number;
    try {
      toPosition = completeInsertionPosition({
        cards: state.cards.filter(card => !card.archived),
        cardId,
        fromListId: movingCard.listId,
        toListId,
        originalVisibleIds: visibleGroups[toListId] ?? [],
        nextVisibleIds: nextGroups[toListId] ?? [],
      });
    } catch {
      dragSnapshot.current = null;
      setDragAnnouncement(`Canceled moving ${movingCard.title}; the board changed during the drag.`);
      return;
    }

    if (movingCard.listId === toListId && movingCard.position === toPosition) {
      dragSnapshot.current = null;
      setDragAnnouncement(`${movingCard.title} stayed in its original position.`);
      return;
    }

    const snapshot = dragSnapshot.current ?? { cards: state.cards, notifications: state.notifications };
    dispatch({ type: 'MOVE_CARD', payload: { cardId, toListId, toPosition } });
    setDragAnnouncement(`Moving ${movingCard.title} to position ${toPosition + 1}.`);
    void moveCardApi(cardId, toListId, toPosition).then(card => {
      dispatch({ type: 'APPLY_CARD_FROM_API', payload: card });
      dragSnapshot.current = null;
      setDragAnnouncement(`${card.title} moved to position ${card.position + 1}.`);
    }).catch(error => {
      dispatch({ type: 'RESTORE_CARDS', payload: snapshot });
      dragSnapshot.current = null;
      const message = error instanceof Error ? error.message : 'Unable to save the new card order.';
      setDragAnnouncement(`Could not move ${movingCard.title}. The previous order was restored.`);
      toast({ title: 'Card order not saved', description: message, variant: 'destructive' });
    });
  };

  return (
    <DragDropProvider
      onDragStart={event => {
        const cardId = String(event.operation.source?.id ?? '');
        const card = state.cards.find(candidate => candidate.id === cardId);
        if (!card) return;
        dragSnapshot.current = { cards: state.cards, notifications: state.notifications };
        suppressOpenCardId.current = cardId;
        setActiveCardId(cardId);
        setDragAnnouncement(`Picked up ${card.title}. Move the pointer to choose a position, then release to drop.`);
      }}
      onDragEnd={handleDragEnd}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">{dragAnnouncement}</div>
      <div className="flex gap-4 p-4 overflow-x-auto flex-1 items-start" style={{ height: 'calc(100% - 0px)' }}>
        {lists.map(list => (
          <ListColumn
            key={list.id}
            list={list}
            cards={visibleCardsByList[list.id] ?? []}
            shouldSuppressOpen={cardId => {
              if (suppressOpenCardId.current !== cardId) return false;
              suppressOpenCardId.current = null;
              return true;
            }}
          />
        ))}
        {/* Add list */}
        {canManageBoard && <div className="w-72 shrink-0">
          {addingList ? (
            <div className="rounded-xl p-3" style={{ background: 'var(--list-bg)' }}>
              <input
                autoFocus
                value={newListTitle}
                onChange={e => setNewListTitle(e.target.value)}
                onBlur={submitList}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitList();
                  }
                  if (e.key === 'Escape') { setAddingList(false); setNewListTitle(''); }
                }}
                placeholder="List title…"
                className="w-full px-2 py-1.5 rounded-lg text-sm outline-none border"
                style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text-primary)' }}
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingList(true)}
              className="w-full text-left px-3 min-h-[44px] flex items-center rounded-xl text-xs font-medium transition-colors"
              style={{ color: 'var(--text-muted)', background: 'var(--list-bg)' }}
            >
              + Add another list
            </button>
          )}
        </div>}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
        {activeCard ? <CardOverlay card={activeCard} /> : null}
      </DragOverlay>
    </DragDropProvider>
  );
}

/* ───── Table View ───── */
export function TableView() {
  const state = useAppState();
  const dispatch = useDispatch();
  const lists = state.lists.filter(l => l.boardId === state.currentBoardId && !l.archived).sort((a, b) => a.position - b.position);
  const board = state.boards.find(b => b.id === state.currentBoardId);
  const allCards = state.cards
    .filter(c => c.boardId === state.currentBoardId && passesFilter(c, state))
    .sort((a, b) => a.position - b.position);

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

  const cardsWithDue = state.cards.filter(c => c.boardId === state.currentBoardId && passesFilter(c, state) && c.dueDate);

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
