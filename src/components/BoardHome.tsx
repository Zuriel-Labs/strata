import { useEffect, useState } from 'react';
import { useAppState, useDispatch } from '../store';
import { useAuth } from '../lib/auth-context';
import { ApiError } from '../services/api';
import { fetchNavigation, setPersonalStar, visitBoard, type NavigationBoard, type NavigationPage } from '../services/navigation';
import { Button } from './ui/button';
import { AcceptBoardInvitation } from './AcceptBoardInvitation';

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
  const [knownStars, setKnownStars] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  function changeSection(next: HomeSection) {
    setSection(next);
    setError(null);
    setNotice(null);
    setPage({ items: [], nextCursor: null });
    setLoading(next !== 'all');
  }
  useEffect(() => {
    let cancelled = false;
    if (section !== 'all') void fetchNavigation(section).then(result => {
      if (!cancelled) {
        setPage(result);
        setKnownStars(previous => ({ ...previous, ...Object.fromEntries(result.items.map(item => [item.boardId, item.starred])) }));
      }
    }).catch(async failure => {
      if (!cancelled) setError('Unable to load your boards. Retry when connected.');
      if (!cancelled && failure instanceof ApiError && failure.status === 401) await refresh();
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [section, reload, refresh]);
  const rows: NavigationBoard[] = section === 'all'
    ? state.boards.filter(board => board.workspaceId === state.currentWorkspaceId).map(board => ({ boardId: board.id, workspaceId: board.workspaceId, title: board.title, color: board.color, starred: knownStars[board.id] ?? false, lastVisitedAt: null }))
    : page.items.filter(item => state.boards.some(board => board.id === item.boardId)).map(item => ({ ...item, starred: knownStars[item.boardId] ?? item.starred }));
  async function changeStar(row: NavigationBoard) {
    setPending(row.boardId);
    setError(null);
    try {
      const result = await setPersonalStar(row.boardId, !row.starred);
      setKnownStars(previous => ({ ...previous, [result.boardId]: result.starred }));
      if (section === 'starred' && !result.starred) setPage(previous => ({ ...previous, items: previous.items.filter(item => item.boardId !== result.boardId) }));
      setNotice(result.starred ? 'Board added to your stars.' : 'Board removed from your stars.');
    } catch (failure) {
      setError('Unable to save your star. Retry when connected.');
      if (failure instanceof ApiError && [401, 404].includes(failure.status)) await refresh();
    } finally { setPending(null); }
  }
  async function loadMore() {
    if (section === 'all' || !page.nextCursor) return;
    setPending('page');
    try {
      const result = await fetchNavigation(section, page.nextCursor);
      setPage(previous => ({ items: [...previous.items, ...result.items.filter(item => !previous.items.some(old => old.boardId === item.boardId))], nextCursor: result.nextCursor }));
      setKnownStars(previous => ({ ...previous, ...Object.fromEntries(result.items.map(item => [item.boardId, item.starred])) }));
    } catch (failure) {
      setError('Unable to load more boards. Retry when connected.');
      if (failure instanceof ApiError && failure.status === 401) await refresh();
    } finally { setPending(null); }
  }
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
      {([['recent', 'Recent'], ['starred', 'Your stars'], ['all', 'All boards']] as const).map(([key, title]) => <Button key={key} disabled={pending !== null} variant={section === key ? 'secondary' : 'outline'} aria-pressed={section === key} onClick={() => { if (key !== section) changeSection(key); }}>{title}</Button>)}
    </div>
    {section === 'all' && <label className="block text-sm">Workspace
      <select className="block w-full mt-1 p-2 border rounded bg-background" value={state.currentWorkspaceId ?? ''} onChange={event => dispatch({ type: 'SET_CURRENT_WORKSPACE', payload: event.target.value })}>
        {!state.workspaces.length && <option value="">No workspaces available</option>}
        {state.workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
      </select>
    </label>}
    {error && <div role="alert" className="space-y-2"><p>{error}</p><Button variant="outline" onClick={() => { changeSection(section); setReload(value => value + 1); }}>Retry boards</Button></div>}
    {notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">Loading your boards…</p> : !error && !rows.length && <p>{section === 'recent' ? 'No recent boards yet.' : section === 'starred' ? 'No starred boards yet.' : !state.workspaces.length ? 'No workspaces available. Ask an administrator for board access.' : 'No boards in this workspace.'}</p>}
    {!loading && !error && <ul className="space-y-2">{rows.map(row => <li key={row.boardId} className="flex items-center gap-2 rounded border p-2 min-w-0">
      <span className="w-3 h-3 rounded shrink-0" style={{ background: row.color }} aria-hidden="true" />
      <button disabled={pending !== null} aria-label={`Open ${row.title}`} onClick={() => void openBoard(row.boardId)} className="text-left min-w-0 flex-1 p-2 rounded focus-visible:outline focus-visible:outline-2">
        <span className="block truncate">{row.title}</span><span className="block text-xs opacity-70 truncate">{state.workspaces.find(workspace => workspace.id === row.workspaceId)?.name}</span>
      </button>
      <Button variant="outline" disabled={pending !== null} aria-label={row.starred ? `Remove ${row.title} from your stars` : `Add ${row.title} to your stars`} onClick={() => void changeStar(row)}>{row.starred ? '★' : '☆'}</Button>
    </li>)}</ul>}
    {!loading && !error && section !== 'all' && page.nextCursor && <Button variant="outline" disabled={pending !== null} onClick={() => void loadMore()}>Load more boards</Button>}
    <AcceptBoardInvitation />
  </section>;
}
