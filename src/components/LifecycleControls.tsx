import { useState } from 'react';
import { useAppState } from '../store';
import { useAuth } from '../lib/auth-context';
import { setBoardTemplate, setLifecycle } from '../services/content';
import { ContentOperationDialog, type ContentOperationDialogProps } from './ContentOperationDialog';
import { Button } from './ui/button';

export function LifecycleButton({ kind, id }: { kind: 'workspace' | 'board'; id: string }) {
  const state = useAppState();
  const auth = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const board = kind === 'board' ? state.boards.find(item => item.id === id) : undefined;
  const workspace = state.workspaces.find(item => item.id === (kind === 'workspace' ? id : board?.workspaceId));
  const resource = board ?? workspace;
  const allowed = kind === 'board' ? auth.canManageBoard(id) : auth.canManageWorkspace(id);
  if (!resource || !allowed) return null;
  const closed = resource.lifecycleState === 'closed';
  const name = board?.title ?? workspace?.name ?? '';
  return <div className="min-w-0 text-xs"><Button size="sm" variant="outline" disabled={pending || (kind === 'board' && workspace?.lifecycleState === 'closed')} aria-label={`${closed ? 'Reopen' : 'Close'} ${kind} ${name}`} onClick={async () => {
    setPending(true); setError('');
    try { await setLifecycle(kind === 'board' ? 'boards' : 'workspaces', id, closed ? 'reopen' : 'close', resource.revision ?? 0); await auth.refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to change lifecycle state.'); }
    finally { setPending(false); }
  }}>{pending ? 'Saving…' : closed ? 'Reopen' : 'Close'} {kind}</Button>{error && <p role="alert" className="max-w-64 text-red-400">{error}</p>}</div>;
}

export function BoardActions({ boardId }: { boardId: string }) {
  const state = useAppState();
  const auth = useAuth();
  const board = state.boards.find(item => item.id === boardId);
  const [operation, setOperation] = useState<ContentOperationDialogProps['kind'] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (!board) return null;
  const workspace = state.workspaces.find(item => item.id === board.workspaceId);
  const active = board.lifecycleState !== 'closed' && workspace?.lifecycleState !== 'closed';
  const admin = auth.canManageBoard(boardId);
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    {board.isTemplate && <span className="text-xs">Private template</span>}
    {active && <Button size="sm" variant="outline" onClick={() => setOperation('board_copy')}>Copy board</Button>}
    {active && auth.canManageWorkspace(board.workspaceId) && <Button size="sm" variant="outline" onClick={() => setOperation('board_move')}>Transfer board</Button>}
    {active && admin && <Button size="sm" variant="outline" disabled={pending} onClick={async () => {
      setPending(true); setError('');
      try { await setBoardTemplate(board.id, !board.isTemplate, board.revision ?? 0); await auth.refresh(); }
      catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to change template state.'); }
      finally { setPending(false); }
    }}>{board.isTemplate ? 'Convert to board' : 'Convert to template'}</Button>}
    <LifecycleButton kind="board" id={board.id} />
    {admin && board.lifecycleState === 'closed' && <Button size="sm" variant="destructive" onClick={() => setOperation('delete')}>Delete closed board</Button>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {operation && <ContentOperationDialog kind={operation} sourceId={board.id} resourceType={operation === 'delete' ? 'board' : undefined} onClose={() => setOperation(null)} />}
  </div>;
}
