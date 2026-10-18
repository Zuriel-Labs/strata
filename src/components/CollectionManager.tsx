import { useEffect, useState } from 'react';
import { useAppState } from '../store';
import { useAuth } from '../lib/auth-context';
import { ApiError } from '../services/api';
import { createCollection, fetchCollections, removeCollection, renameCollection, setCollectionBoard, type BoardCollection } from '../services/collections';
import { Button } from './ui/button';

export function CollectionManager({ workspaceId, onFilter }: { workspaceId: string; onFilter?: (boardIds: string[] | null) => void }) {
  const state = useAppState(); const auth = useAuth();
  const { refresh } = auth;
  const [loaded, setLoaded] = useState<{ workspaceId: string; items: BoardCollection[]; nextCursor: string | null } | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const items = loaded?.workspaceId === workspaceId ? loaded.items : [];
  const selected = items.find(item => item.id === selectedId);
  const manager = !onFilter && auth.canManageWorkspace(workspaceId) && state.workspaces.find(workspace => workspace.id === workspaceId)?.lifecycleState !== 'closed';
  const boards = state.boards.filter(board => board.workspaceId === workspaceId);
  useEffect(() => {
    let cancelled = false;
    void fetchCollections(workspaceId).then(result => { if (!cancelled) { setLoaded({ workspaceId, items: result.items, nextCursor: result.nextCursor }); setError(''); } })
      .catch(async failure => { if (!cancelled) { setLoaded(null); setError('Unable to load collections. Retry when connected.'); } if (!cancelled && failure instanceof ApiError && [401, 403, 404].includes(failure.status)) await refresh(); });
    return () => { cancelled = true; };
  }, [workspaceId, reload, refresh]);
  const mutate = async (action: () => Promise<string | null>) => {
    setPending(true); setError('');
    try {
      const targetId = await action();
      let result = await fetchCollections(workspaceId);
      const refreshed = [...result.items];
      while (result.nextCursor && targetId && !refreshed.some(item => item.id === targetId)) {
        result = await fetchCollections(workspaceId, result.nextCursor);
        refreshed.push(...result.items);
      }
      setLoaded({ workspaceId, items: refreshed, nextCursor: result.nextCursor });
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Collection was not saved.'); if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) { setLoaded(null); await refresh(); } }
    finally { setPending(false); }
  };
  return <section aria-label="Board collections" className="space-y-2 rounded border p-3 text-sm min-w-0">
    <h3 className="font-semibold">Collections</h3><p className="text-xs opacity-75">Group boards within this workspace. Collections never grant access.</p>
    <label className="block">Collection<select aria-label="Collection" className="mt-1 block w-full rounded border bg-background p-2" value={selected?.id ?? ''} disabled={pending} onChange={event => { const item = items.find(collection => collection.id === event.target.value); setSelectedId(item?.id ?? ''); setName(item?.name ?? ''); onFilter?.(item?.boardIds ?? null); }}><option value="">{onFilter ? 'All collections' : 'Create a collection'}</option>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {loaded?.workspaceId === workspaceId && loaded.nextCursor && <Button size="sm" variant="outline" disabled={pending} onClick={async () => {
      setPending(true); setError('');
      try { const result = await fetchCollections(workspaceId, loaded.nextCursor ?? undefined); setLoaded({ workspaceId, items: [...loaded.items, ...result.items.filter(item => !loaded.items.some(previous => previous.id === item.id))], nextCursor: result.nextCursor }); }
      catch { setError('Unable to load more collections. Retry when connected.'); }
      finally { setPending(false); }
    }}>Load more collections</Button>}
    {manager && <><label className="block">Collection name<input className="mt-1 block w-full rounded border bg-background p-2" maxLength={200} value={name} disabled={pending} onChange={event => setName(event.target.value)} /></label>
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={pending || !name.trim()} onClick={() => void mutate(async () => { if (selected) { await renameCollection(selected, name.trim()); return selected.id; } const created = await createCollection(workspaceId, name.trim()); setSelectedId(created.id); return created.id; })}>{selected ? 'Rename collection' : 'Create collection'}</Button>
        {selected && <Button size="sm" variant="outline" disabled={pending} onClick={() => void mutate(async () => { await removeCollection(selected); setSelectedId(''); setName(''); return null; })}>Remove grouping</Button>}</div>
      {selected && <fieldset disabled={pending} className="space-y-2"><legend className="font-medium">Boards in this collection</legend>{boards.map(board => <label key={board.id} className="flex items-center gap-2 break-words"><input type="checkbox" checked={selected.boardIds.includes(board.id)} onChange={event => void mutate(async () => { await setCollectionBoard(selected.id, board.id, event.target.checked); return selected.id; })} />{board.title}</label>)}</fieldset>}
    </>}
    {pending && <p role="status">Saving collection…</p>}
    {error && <div role="alert"><p>{error}</p><Button variant="outline" size="sm" onClick={() => setReload(value => value + 1)}>Retry collections</Button></div>}
  </section>;
}
