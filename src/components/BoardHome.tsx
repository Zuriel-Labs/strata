import { useEffect, useState } from 'react';
import { useAppState, useDispatch } from '../store';
import { useAuth } from '../lib/auth-context';
import { ApiError } from '../services/api';
import { fetchNavigation, visitBoard, type NavigationBoard, type NavigationPage } from '../services/navigation';
import { Button } from './ui/button';

type HomeSection = 'recent' | 'starred' | 'all';
export function BoardHome({ onOpen }: { onOpen?: () => void }) {
  const state = useAppState();
  const dispatch = useDispatch();
  const { refresh } = useAuth();
  const [section, setSection] = useState<HomeSection>('recent');
  const [page, setPage] = useState<NavigationPage>({ items: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPage({ items: [], nextCursor: null });
    setLoading(section !== 'all');
    if (section !== 'all') void fetchNavigation(section).then(result => {
      if (!cancelled) setPage(result);
    }).catch(() => {
      if (!cancelled) setError('Unable to load your boards. Retry when connected.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [section, reload]);
  const rows: NavigationBoard[] = section === 'all'
    ? state.boards.filter(board => board.workspaceId === state.currentWorkspaceId).map(board => ({ boardId: board.id, workspaceId: board.workspaceId, title: board.title, color: board.color, starred: false, lastVisitedAt: null }))
    : page.items.filter(item => state.boards.some(board => board.id === item.boardId));
  async function openBoard(boardId: string) {
    setPending(boardId);
    setError(null);
    try {
      await visitBoard(boardId);
      dispatch({ type: 'SET_ACTIVE_CARD', payload: null });
      dispatch({ type: 'SET_CURRENT_BOARD', payload: boardId });
      onOpen?.();
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 404 ? 'Destination unavailable. Refresh your boards.' : 'Unable to open this board. Retry when connected.');
      if (failure instanceof ApiError && [401, 404].includes(failure.status)) await refresh();
    } finally { setPending(null); }
  }
  return <section className="w-full max-w-3xl mx-auto p-4 space-y-4 min-w-0" aria-label="Your boards">
    <h2 className="text-xl font-semibold">Home</h2>
    <div className="flex flex-wrap gap-2" aria-label="Board sections">
      {([['recent', 'Recent'], ['starred', 'Your stars'], ['all', 'All boards']] as const).map(([key, title]) => <Button key={key} variant={section === key ? 'secondary' : 'outline'} aria-pressed={section === key} onClick={() => setSection(key)}>{title}</Button>)}
    </div>
    {section === 'all' && <label className="block text-sm">Workspace
      <select className="block w-full mt-1 p-2 border rounded bg-background" value={state.currentWorkspaceId ?? ''} onChange={event => dispatch({ type: 'SET_CURRENT_WORKSPACE', payload: event.target.value })}>
        {!state.workspaces.length && <option value="">No workspaces available</option>}
        {state.workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
      </select>
    </label>}
    {error && <div role="alert" className="space-y-2"><p>{error}</p><Button variant="outline" onClick={() => setReload(value => value + 1)}>Retry boards</Button></div>}
    {loading ? <p role="status">Loading your boards…</p> : !error && !rows.length && <p>{section === 'recent' ? 'No recent boards yet.' : section === 'starred' ? 'No starred boards yet.' : !state.workspaces.length ? 'No workspaces available. Ask an administrator for board access.' : 'No boards in this workspace.'}</p>}
    {!loading && !error && <ul className="space-y-2">{rows.map(row => <li key={row.boardId} className="flex items-center gap-2 rounded border p-2 min-w-0">
      <span className="w-3 h-3 rounded shrink-0" style={{ background: row.color }} aria-hidden="true" />
      <button disabled={pending !== null} aria-label={`Open ${row.title}`} onClick={() => void openBoard(row.boardId)} className="text-left min-w-0 flex-1 p-2 rounded focus-visible:outline focus-visible:outline-2">
        <span className="block truncate">{row.title}</span><span className="block text-xs opacity-70 truncate">{state.workspaces.find(workspace => workspace.id === row.workspaceId)?.name}</span>
      </button>
    </li>)}</ul>}
  </section>;
}
