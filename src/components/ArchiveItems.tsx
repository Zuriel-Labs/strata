import { useState } from 'react';
import type { Card, List } from '../types';
import { useAppState, useDispatch } from '../store';
import { useAuth } from '../lib/auth-context';
import { deleteCardApi, deleteListApi, restoreListApi, updateCardApi } from '../services/data';
import { getArchivedBoardItems } from '../lib/archive-items';

type DeleteCandidate =
  | { kind: 'list'; item: List }
  | { kind: 'card'; item: Card };

export function ArchiveItems({ compact = false }: { compact?: boolean }) {
  const state = useAppState();
  const dispatch = useDispatch();
  const auth = useAuth();
  const [deleteCandidate, setDeleteCandidate] = useState<DeleteCandidate | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!state.currentBoardId) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Select a board to view its archive.</p>;

  const { archivedLists, archivedCards } = getArchivedBoardItems(state, state.currentBoardId);
  const canManageArchive = auth.canArchiveBoardContent(state.currentBoardId);
  const rowPadding = compact ? 'px-2' : 'px-3';

  const restoreList = async (list: List) => {
    setPendingKey(`list:${list.id}`);
    setError('');
    try {
      await restoreListApi(list.id);
      dispatch({ type: 'RESTORE_LIST', payload: list.id });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The list could not be restored.');
    } finally {
      setPendingKey(null);
    }
  };

  const restoreCard = async (card: Card) => {
    setPendingKey(`card:${card.id}`);
    setError('');
    try {
      const updated = await updateCardApi(card.id, { archived: false });
      dispatch({ type: 'APPLY_CARD_FROM_API', payload: updated });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The card could not be restored.');
    } finally {
      setPendingKey(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteCandidate || pendingKey) return;
    const { item, kind } = deleteCandidate;
    setPendingKey(`${kind}:${item.id}`);
    setError('');
    try {
      if (kind === 'list') {
        await deleteListApi(item.id);
        dispatch({ type: 'DELETE_LIST', payload: item.id });
      } else {
        await deleteCardApi(item.id);
        dispatch({ type: 'DELETE_CARD', payload: item.id });
      }
      setDeleteCandidate(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `The archived ${kind} could not be deleted.`);
    } finally {
      setPendingKey(null);
    }
  };

  if (archivedLists.length === 0 && archivedCards.length === 0) {
    return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{compact ? 'Nothing archived' : 'Nothing archived on this board.'}</p>;
  }

  return (
    <div
      data-testid="archive-items"
      className={`relative space-y-2 ${deleteCandidate && !compact ? 'min-h-[20rem]' : ''}`}
    >
      {error && <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
      {archivedLists.map(list => {
        const pending = pendingKey === `list:${list.id}`;
        return (
          <div key={list.id} className={`flex min-h-[44px] items-center justify-between gap-2 rounded-lg ${rowPadding}`} style={{ background: 'var(--active-bg)', color: 'var(--text-secondary)' }}>
            <span className="min-w-0 truncate text-xs">📋 {list.title}</span>
            <div className="ml-1 flex shrink-0 gap-2">
              <button type="button" disabled={pending} onClick={() => void restoreList(list)} className="min-h-[44px] text-xs underline disabled:opacity-50" style={{ color: 'var(--accent)' }}>Restore</button>
              {canManageArchive && (
                <button type="button" aria-label={`Delete archived list ${list.title}`} disabled={pending} onClick={() => setDeleteCandidate({ kind: 'list', item: list })} className="min-h-[44px] text-xs underline disabled:opacity-50" style={{ color: '#ef4444' }}>Delete</button>
              )}
            </div>
          </div>
        );
      })}
      {archivedCards.map(card => {
        const pending = pendingKey === `card:${card.id}`;
        return (
          <div key={card.id} className={`flex min-h-[44px] items-center justify-between gap-2 rounded-lg ${rowPadding}`} style={{ background: 'var(--active-bg)', color: 'var(--text-secondary)' }}>
            <span className="min-w-0 truncate text-xs">🃏 {card.title}</span>
            <div className="ml-1 flex shrink-0 gap-2">
              <button type="button" disabled={pending} onClick={() => void restoreCard(card)} className="min-h-[44px] text-xs underline disabled:opacity-50" style={{ color: 'var(--accent)' }}>Restore</button>
              {canManageArchive && (
                <button type="button" aria-label={`Delete archived card ${card.title}`} disabled={pending} onClick={() => setDeleteCandidate({ kind: 'card', item: card })} className="min-h-[44px] text-xs underline disabled:opacity-50" style={{ color: '#ef4444' }}>Delete</button>
              )}
            </div>
          </div>
        );
      })}

      {deleteCandidate && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl p-3" style={{ background: 'rgba(5,7,12,0.9)' }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="archive-delete-title" className="w-full max-w-sm rounded-xl border p-4 shadow-2xl" style={{ background: 'var(--modal-bg)', borderColor: 'var(--border)' }}>
            <h3 id="archive-delete-title" className="font-bold" style={{ color: 'var(--text-primary)' }}>Permanently delete {deleteCandidate.item.title}?</h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {deleteCandidate.kind === 'list'
                ? 'This permanently deletes the archived list and every card it contains. This cannot be undone.'
                : 'This permanently deletes the archived card. This cannot be undone.'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={Boolean(pendingKey)} onClick={() => setDeleteCandidate(null)} className="min-h-[44px] px-3 text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
              <button
                type="button"
                aria-label={`Confirm delete archived ${deleteCandidate.kind}`}
                disabled={Boolean(pendingKey)}
                onClick={() => void confirmDelete()}
                className="min-h-[44px] rounded-md bg-red-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
              >{pendingKey ? 'Deleting…' : 'Delete permanently'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
