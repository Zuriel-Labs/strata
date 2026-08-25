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
import { compareDateOnlyToToday, differenceInCalendarDays, formatDateOnly, sameDateOnly, todayDateOnly } from '../lib/date-only';
import { locateCardInsertion, locateListInsertion } from '../lib/drag-preview';

type BoardDragOverEvent = Parameters<NonNullable<ComponentProps<typeof DragDropProvider>['onDragOver']>>[0];

/* ───── helpers ───── */
function passesFilter(card: CardType, state: ReturnType<typeof useAppState>) {
  if (card.archived) return false;
  if (state.filterLabelIds.length && !state.filterLabelIds.some(id => card.labelIds.includes(id))) return false;
  if (state.filterMemberIds.length && !state.filterMemberIds.some(id => card.memberIds.includes(id))) return false;
  if (state.filterDue !== 'all') {
    const today = todayDateOnly();
    const calendarDays = differenceInCalendarDays(card.dueDate, today);
    if (state.filterDue === 'none' && card.dueDate) return false;
    if (state.filterDue === 'overdue' && (!card.dueDate || compareDateOnlyToToday(card.dueDate, today) !== -1 || card.dueDateComplete)) return false;
    if (state.filterDue === 'week' && (!card.dueDate || calendarDays === null || calendarDays > 7)) return false;
    if (state.filterDue === 'month' && (!card.dueDate || calendarDays === null || calendarDays > 30)) return false;
  }
  return true;
}

function dueBadge(card: CardType) {
  if (!card.dueDate) return null;
  const dayDifference = differenceInCalendarDays(card.dueDate);
  let bg = 'var(--active-bg)';
  let fg = 'var(--text-muted)';
  if (card.dueDateComplete) { bg = '#22c55e'; fg = '#fff'; }
  else if (dayDifference !== null && dayDifference < 0) { bg = '#ef4444'; fg = '#fff'; }
  else if (dayDifference === 0) { bg = '#f59e0b'; fg = '#fff'; }
  const label = formatDateOnly(card.dueDate, { month: 'short', day: 'numeric' });
  if (!label) return null;
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: bg, color: fg }}>⏱ {label}</span>;
}

function previewHorizontalOrder(ids: string[], event: BoardDragOverEvent) {
  const sourceId = String(event.operation.source?.id ?? '');
  const target = event.operation.target;
  const targetId = String(target?.id ?? '');
  if (!sourceId || !target || sourceId === targetId || !ids.includes(sourceId) || !ids.includes(targetId)) return ids;

  const withoutSource = ids.filter(id => id !== sourceId);
  const targetIndex = withoutSource.indexOf(targetId);
  const insertAfterTarget = ids.indexOf(sourceId) < ids.indexOf(targetId);
  const insertionIndex = targetIndex + (insertAfterTarget ? 1 : 0);
  withoutSource.splice(insertionIndex, 0, sourceId);
  return withoutSource;
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

function SortableCardItem({ card, index, group, shouldSuppressOpen, isPreviewPlaceholder }: { card: CardType; index: number; group: string; shouldSuppressOpen: (cardId: string) => boolean; isPreviewPlaceholder: boolean }) {
  const dispatch = useDispatch();
  const { ref, isDragSource, isDropTarget } = useSortable({
    id: card.id,
    index,
    group,
    type: 'card',
    accept: 'card',
    data: { cardId: card.id, listId: group },
    sensors: [PointerSensor],
    plugins: [],
    transition: { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', idle: true },
  });

  return (
    <div
      ref={ref}
      data-card-id={card.id}
      data-drag-activator="card"
      data-card-placeholder={isPreviewPlaceholder ? 'true' : undefined}
      onClick={() => {
        if (shouldSuppressOpen(card.id)) return;
        dispatch({ type: 'SET_ACTIVE_CARD', payload: card.id });
      }}
      className="group relative rounded-lg p-3 mb-2 cursor-grab active:cursor-grabbing touch-manipulation select-none transition-[border-color,box-shadow,opacity] duration-200"
      style={{
        background: 'var(--card-bg)',
        border: `${isPreviewPlaceholder ? 2 : 1}px ${isPreviewPlaceholder ? 'dashed' : 'solid'} ${isDropTarget || isPreviewPlaceholder ? 'var(--accent)' : 'var(--card-border)'}`,
        boxShadow: isDropTarget || isPreviewPlaceholder ? '0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent)' : undefined,
        opacity: isDragSource || isPreviewPlaceholder ? 0.28 : 1,
      }}
      onMouseEnter={event => { if (!isDropTarget) event.currentTarget.style.borderColor = 'var(--accent)'; }}
      onMouseLeave={event => { if (!isDropTarget) event.currentTarget.style.borderColor = 'var(--card-border)'; }}
    >
      <CardContents card={card} />
    </div>
  );
}

function CardItem({ card, index, group, canReorder, shouldSuppressOpen, isPreviewPlaceholder }: { card: CardType; index: number; group: string; canReorder: boolean; shouldSuppressOpen: (cardId: string) => boolean; isPreviewPlaceholder: boolean }) {
  return canReorder
    ? <SortableCardItem card={card} index={index} group={group} shouldSuppressOpen={shouldSuppressOpen} isPreviewPlaceholder={isPreviewPlaceholder} />
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

function ListOverlay({ list, cardCount }: { list: ListType; cardCount: number }) {
  return (
    <div
      data-list-drag-overlay="true"
      className="w-72 rotate-1 overflow-hidden rounded-xl border"
      style={{ background: 'var(--list-bg)', borderColor: 'var(--accent)', boxShadow: '0 22px 52px rgb(0 0 0 / 38%)' }}
      aria-hidden="true"
    >
      <div className="flex min-h-[52px] items-center justify-between border-b px-3" style={{ background: 'var(--active-bg)', borderColor: 'var(--border)' }}>
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-primary)' }}>{list.title}</span>
        <span className="rounded-md px-2 py-1 text-[10px]" style={{ background: 'var(--card-bg)', color: 'var(--text-muted)' }}>{cardCount}</span>
      </div>
      <div className="space-y-2 p-2 opacity-55">
        {Array.from({ length: Math.min(Math.max(cardCount, 1), 3) }, (_, index) => (
          <div key={index} className="h-12 rounded-lg border" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }} />
        ))}
      </div>
    </div>
  );
}

/* ───── List Component ───── */
function ListColumn({ list, cards, index, shouldSuppressOpen, activeCardId, isPreviewPlaceholder }: { list: ListType; cards: CardType[]; index: number; shouldSuppressOpen: (cardId: string) => boolean; activeCardId: string | null; isPreviewPlaceholder: boolean }) {
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
  const canMoveList = auth.canManageBoard(list.boardId);
  const { toast } = useToast();
  const { ref: cardsDropRef, isDropTarget: isCardDropTarget } = useDroppable({ id: list.id, type: 'card-list', accept: 'card', disabled: !canEditCards });
  const {
    ref: listRef,
    handleRef: listHandleRef,
    isDragSource: isListDragSource,
    isDropTarget: isListDropTarget,
  } = useSortable({
    id: `list:${list.id}`,
    index,
    group: `board:${list.boardId}`,
    type: 'list',
    accept: 'list',
    data: { listId: list.id, boardId: list.boardId },
    sensors: [PointerSensor],
    plugins: [],
    disabled: !canMoveList,
    transition: { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', idle: true },
  });

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
    if (sortPending || !canMoveList) return;
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
      ref={listRef}
      data-list-id={list.id}
      data-list-sortable-id={`list:${list.id}`}
      data-list-placeholder={isListDragSource || isPreviewPlaceholder ? 'true' : undefined}
      className="w-72 shrink-0 rounded-xl flex flex-col max-h-full border transition-[border-color,box-shadow,opacity,transform] duration-200"
      style={{
        background: isCardDropTarget ? 'var(--list-hover-bg)' : 'var(--list-bg)',
        borderColor: isListDropTarget ? 'var(--accent)' : 'transparent',
        boxShadow: isListDropTarget ? '0 0 0 2px color-mix(in srgb, var(--accent) 24%, transparent)' : undefined,
        opacity: isListDragSource || isPreviewPlaceholder ? 0.2 : 1,
      }}
    >
      {/* List header */}
      <div
        className="flex min-h-[52px] items-center justify-between rounded-t-xl border-b"
        style={{ background: isListDragSource || isListDropTarget ? 'var(--active-bg)' : 'transparent', borderColor: 'var(--border)' }}
      >
        <div
          ref={editingTitle ? undefined : listHandleRef}
          data-list-drag-handle={canMoveList && !editingTitle ? list.id : undefined}
          className={`flex min-h-[52px] min-w-0 flex-1 items-center px-3 ${canMoveList && !editingTitle ? 'cursor-grab active:cursor-grabbing touch-manipulation select-none' : ''}`}
        >
          {editingTitle ? (
            <input
              autoFocus
              onPointerDown={event => event.stopPropagation()}
              value={listTitle}
              onChange={e => setListTitle(e.target.value)}
              onBlur={() => { dispatch({ type: 'UPDATE_LIST', payload: { id: list.id, title: listTitle } }); updateListApi(list.id, { title: listTitle }); setEditingTitle(false); }}
              onKeyDown={e => { if (e.key === 'Enter') { dispatch({ type: 'UPDATE_LIST', payload: { id: list.id, title: listTitle } }); updateListApi(list.id, { title: listTitle }); setEditingTitle(false); } }}
              className="min-w-0 flex-1 bg-transparent text-xs font-bold uppercase tracking-widest outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
          ) : (
            <h3
              onClick={() => {
                if (!canMoveList) return;
                setEditingTitle(true);
                setListTitle(list.title);
              }}
              className={`truncate text-[11px] font-bold uppercase tracking-widest ${canMoveList ? 'cursor-pointer' : ''}`}
              style={{ color: 'var(--text-muted)' }}
            >
              {list.title} <span className="font-normal">({cards.length})</span>
            </h3>
          )}
        </div>
        <div className="relative mr-2 shrink-0">
          {(canMoveList || canArchiveContent) && <button type="button" disabled={Boolean(sortPending)} aria-label={`List actions for ${list.title}`} aria-expanded={menuOpen} onPointerDown={event => event.stopPropagation()} onClick={() => setMenuOpen(!menuOpen)} className="w-8 h-8 rounded-md flex items-center justify-center text-sm hover:opacity-70 disabled:opacity-50" style={{ color: 'var(--text-muted)', background: 'var(--active-bg)' }}>⋯</button>}
          {menuOpen && (
            <div aria-busy={Boolean(sortPending)} className="absolute right-0 top-full mt-1 w-40 rounded-lg shadow-xl border z-50 py-1" style={{ background: 'var(--dropdown-bg)', borderColor: 'var(--border)' }}>
              {canMoveList && <>
                <button type="button" disabled={Boolean(sortPending)} onClick={() => sortCards('asc')} className="w-full text-left px-3 min-h-[44px] flex items-center text-xs hover:opacity-70 disabled:opacity-50" style={{ color: 'var(--text-secondary)' }}>Sort A to Z</button>
                <button type="button" disabled={Boolean(sortPending)} onClick={() => sortCards('desc')} className="w-full text-left px-3 min-h-[44px] flex items-center text-xs hover:opacity-70 disabled:opacity-50" style={{ color: 'var(--text-secondary)' }}>Sort Z to A</button>
              </>}
              {canMoveList && canArchiveContent && <div role="separator" className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />}
              {canArchiveContent && <button type="button" disabled={Boolean(sortPending)} onClick={() => { dispatch({ type: 'ARCHIVE_LIST', payload: list.id }); void archiveListApi(list.id); setMenuOpen(false); }} className="w-full text-left px-3 min-h-[44px] flex items-center text-xs hover:opacity-70 disabled:opacity-50" style={{ color: 'var(--text-secondary)' }}>Archive list</button>}
            </div>
          )}
          <div className="sr-only" aria-live="polite" aria-atomic="true">{sortStatus}</div>
        </div>
      </div>

      {/* Cards */}
      <div ref={cardsDropRef} className="flex-1 overflow-y-auto px-2 pb-2 pt-2 min-h-[40px]">
        {cards.map((card, index) => <CardItem key={card.id} card={card} index={index} group={list.id} canReorder={canEditCards} shouldSuppressOpen={shouldSuppressOpen} isPreviewPlaceholder={activeCardId === card.id} />)}
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
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [cardPreviewGroups, setCardPreviewGroups] = useState<Record<string, string[]> | null>(null);
  const [listPreviewIds, setListPreviewIds] = useState<string[] | null>(null);
  const [dragAnnouncement, setDragAnnouncement] = useState('');
  const dragSnapshot = useRef<{ cards: CardType[]; notifications: typeof state.notifications } | null>(null);
  const listDragSnapshot = useRef<ListType[] | null>(null);
  const cardPreviewGroupsRef = useRef<Record<string, string[]> | null>(null);
  const listPreviewIdsRef = useRef<string[] | null>(null);
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
  const listSortableIds = useMemo(() => lists.map(list => `list:${list.id}`), [lists]);
  const renderedLists = useMemo(() => {
    if (!listPreviewIds) return lists;
    const bySortableId = new Map(lists.map(list => [`list:${list.id}`, list]));
    return listPreviewIds.map(id => bySortableId.get(id)).filter((list): list is ListType => Boolean(list));
  }, [listPreviewIds, lists]);
  const renderedCardsByList = useMemo(() => {
    if (!cardPreviewGroups) return visibleCardsByList;
    const cardsById = new Map(Object.values(visibleCardsByList).flat().map(card => [card.id, card]));
    return Object.fromEntries(lists.map(list => [
      list.id,
      (cardPreviewGroups[list.id] ?? []).map(id => cardsById.get(id)).filter((card): card is CardType => Boolean(card)),
    ])) as Record<string, CardType[]>;
  }, [cardPreviewGroups, lists, visibleCardsByList]);
  const activeCard = activeCardId ? state.cards.find(card => card.id === activeCardId) ?? null : null;
  const activeList = activeListId ? state.lists.find(list => list.id === activeListId) ?? null : null;
  const cardInsertion = activeCardId && cardPreviewGroups ? locateCardInsertion(cardPreviewGroups, activeCardId) : null;
  const listInsertion = activeListId && listPreviewIds ? locateListInsertion(listPreviewIds, `list:${activeListId}`) : null;

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

  const clearCardPreview = () => {
    cardPreviewGroupsRef.current = null;
    setCardPreviewGroups(null);
  };

  const clearListPreview = () => {
    listPreviewIdsRef.current = null;
    setListPreviewIds(null);
  };

  const handleCardDragEnd = (event: Parameters<NonNullable<ComponentProps<typeof DragDropProvider>['onDragEnd']>>[0]) => {
    const cardId = String(event.operation.source?.id ?? '');
    const movingCard = state.cards.find(card => card.id === cardId);
    setActiveCardId(null);
    window.setTimeout(() => {
      if (suppressOpenCardId.current === cardId) suppressOpenCardId.current = null;
    }, 0);
    if (!movingCard || event.canceled) {
      dragSnapshot.current = null;
      clearCardPreview();
      setDragAnnouncement(event.canceled && movingCard ? `Canceled moving ${movingCard.title}.` : '');
      return;
    }

    const nextGroups = cardPreviewGroupsRef.current ?? moveSortable(visibleGroups, event) as Record<string, string[]>;
    clearCardPreview();
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

  const handleListDragEnd = (event: Parameters<NonNullable<ComponentProps<typeof DragDropProvider>['onDragEnd']>>[0]) => {
    const source = event.operation.source;
    const sortableId = String(source?.id ?? '');
    const listId = String(source?.data?.listId ?? sortableId.replace(/^list:/, ''));
    const movingList = state.lists.find(list => list.id === listId);
    const nextIds = listPreviewIdsRef.current ?? moveSortable(listSortableIds, event) as string[];
    clearListPreview();
    setActiveListId(null);

    if (!movingList || event.canceled) {
      listDragSnapshot.current = null;
      setDragAnnouncement(event.canceled && movingList ? `Canceled moving ${movingList.title}.` : '');
      return;
    }

    const toPosition = nextIds.indexOf(sortableId);
    if (toPosition < 0 || movingList.position === toPosition) {
      listDragSnapshot.current = null;
      setDragAnnouncement(toPosition < 0 ? `Canceled moving ${movingList.title}; no valid destination was found.` : `${movingList.title} stayed in its original position.`);
      return;
    }

    const snapshot = listDragSnapshot.current ?? state.lists;
    dispatch({ type: 'MOVE_LIST', payload: { listId, toPosition } });
    setDragAnnouncement(`Moving ${movingList.title} to lane position ${toPosition + 1}.`);
    void moveListApi(listId, toPosition).then(() => {
      listDragSnapshot.current = null;
      setDragAnnouncement(`${movingList.title} moved to lane position ${toPosition + 1}.`);
    }).catch(error => {
      dispatch({ type: 'RESTORE_LISTS', payload: snapshot });
      listDragSnapshot.current = null;
      const message = error instanceof Error ? error.message : 'Unable to save the new swimlane order.';
      setDragAnnouncement(`Could not move ${movingList.title}. The previous lane order was restored.`);
      toast({ title: 'Swimlane order not saved', description: message, variant: 'destructive' });
    });
  };

  return (
    <DragDropProvider
      onDragStart={event => {
        const source = event.operation.source;
        if (source?.type === 'list') {
          const listId = String(source.data?.listId ?? String(source.id).replace(/^list:/, ''));
          const list = state.lists.find(candidate => candidate.id === listId);
          if (!list) return;
          listDragSnapshot.current = state.lists;
          listPreviewIdsRef.current = listSortableIds;
          setListPreviewIds(listSortableIds);
          setActiveListId(listId);
          setDragAnnouncement(`Picked up ${list.title}. Move horizontally to choose a lane position, then release to drop.`);
          return;
        }

        const cardId = String(source?.id ?? '');
        const card = state.cards.find(candidate => candidate.id === cardId);
        if (!card) return;
        dragSnapshot.current = { cards: state.cards, notifications: state.notifications };
        cardPreviewGroupsRef.current = visibleGroups;
        setCardPreviewGroups(visibleGroups);
        suppressOpenCardId.current = cardId;
        setActiveCardId(cardId);
        setDragAnnouncement(`Picked up ${card.title}. Move the pointer to choose a position, then release to drop.`);
      }}
      onDragOver={event => {
        const source = event.operation.source;
        const target = event.operation.target;
        if (!source || !target || target.id === source.id) return;
        if (source?.type === 'list') {
          // Always project from the committed drag-start order. Reapplying the
          // same hover event to an already-previewed array can move the source
          // past the intended boundary after React renders its new index.
          const next = previewHorizontalOrder(listSortableIds, event);
          listPreviewIdsRef.current = next;
          setListPreviewIds(next);
          return;
        }
        if (source?.type === 'card') {
          const next = moveSortable(visibleGroups, event) as Record<string, string[]>;
          cardPreviewGroupsRef.current = next;
          setCardPreviewGroups(next);
        }
      }}
      onDragEnd={event => {
        if (event.operation.source?.type === 'list') {
          handleListDragEnd(event);
        } else {
          handleCardDragEnd(event);
        }
      }}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">{dragAnnouncement}</div>
      <div className="flex gap-4 p-4 overflow-x-auto flex-1 items-start" style={{ height: 'calc(100% - 0px)' }}>
        {renderedLists.map((list, index) => (
          <ListColumn
            key={list.id}
            list={list}
            cards={renderedCardsByList[list.id] ?? []}
            index={index}
            activeCardId={cardInsertion?.groupId === list.id ? activeCardId : null}
            isPreviewPlaceholder={Boolean(listInsertion && listInsertion.index === index && activeListId === list.id)}
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
        {activeCard ? <CardOverlay card={activeCard} /> : activeList ? <ListOverlay list={activeList} cardCount={visibleCardsByList[activeList.id]?.length ?? 0} /> : null}
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
                <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDateOnly(c.dueDate) ?? '—'}</td>
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
          const dateValue = day ? `${String(month.y).padStart(4, '0')}-${String(month.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
          const dayCards = cardsWithDue.filter(c => c.dueDate && sameDateOnly(c.dueDate, dateValue));
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
