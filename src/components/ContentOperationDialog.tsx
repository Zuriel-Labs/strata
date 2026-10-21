export interface ContentOperationDialogProps {
  kind: 'board_copy' | 'board_move' | 'list_copy' | 'list_move' | 'card_copy' | 'card_move' | 'delete';
  sourceId: string;
  resourceType?: 'workspace' | 'board' | 'list' | 'card';
  onClose: () => void;
  onComplete?: () => void;
}
export function ContentOperationDialog({ kind, sourceId, resourceType, onClose, onComplete }: ContentOperationDialogProps) {
  const state = useAppState();
  const auth = useAuth();
  const returnFocus = useRef<HTMLElement | null>(null);
  const type = resourceType ?? kind.split('_')[0];
  const copy = kind.endsWith('_copy');
  const deletion = kind === 'delete';
  const sourceCard = type === 'card' ? state.cards.find(card => card.id === sourceId) : undefined;
  const sourceList = state.lists.find(list => list.id === (type === 'list' ? sourceId : sourceCard?.listId));
  const sourceBoard = state.boards.find(board => board.id === (type === 'board' ? sourceId : sourceList?.boardId));
  const sourceWorkspace = state.workspaces.find(workspace => workspace.id === (type === 'workspace' ? sourceId : sourceBoard?.workspaceId));
  const sourceName = sourceCard?.title ?? sourceList?.title ?? sourceBoard?.title ?? sourceWorkspace?.name;
  const activeWorkspaces = state.workspaces.filter(workspace => workspace.lifecycleState !== 'closed');
  const workspaceOptions = activeWorkspaces.filter(workspace => auth.canManageWorkspace(workspace.id) && (kind !== 'board_move' || workspace.id !== sourceWorkspace?.id));
  const boardOptions = state.boards.filter(board => board.lifecycleState !== 'closed' && activeWorkspaces.some(workspace => workspace.id === board.workspaceId) && (type === 'card' ? auth.canEditBoardCards(board.id) : auth.canManageBoard(board.id)) && !board.isTemplate);
  const firstBoardId = boardOptions.find(board => board.id === sourceBoard?.id)?.id ?? boardOptions[0]?.id ?? '';
  const [draft, setDraft] = useState<ContentOperationDraft>(() => ({
    kind, sourceId, ...(resourceType ? { resourceType } : {}),
    ...(copy ? { title: `${sourceName ?? type} (copy)`, keep: { cards: true, descriptions: true, checklists: true, checklistCompletion: false, labels: true, dueDates: false, dueCompletion: false, attachments: false } } : {}),
    ...(!deletion && type === 'board' ? { destinationWorkspaceId: workspaceOptions.find(workspace => workspace.id === sourceWorkspace?.id)?.id ?? workspaceOptions[0]?.id ?? '' } : {}),
    ...(!deletion && type !== 'board' ? { destinationBoardId: firstBoardId, ...(type === 'card' ? { destinationListId: state.lists.find(list => list.boardId === firstBoardId && !list.archived)?.id ?? '' } : {}), position: 0 } : {}),
  }));
  const [preview, setPreview] = useState<ContentPreview | null>(null);
  const [key, setKey] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [accessLost, setAccessLost] = useState(false);
  const destinationBoard = state.boards.find(board => board.id === draft.destinationBoardId);
  const lists = state.lists.filter(list => list.boardId === destinationBoard?.id && !list.archived);
  const sourceCards = sourceCard ? [sourceCard] : state.cards.filter(card => (!copy || !card.archived) && (sourceList ? card.listId === sourceList.id : card.boardId === sourceBoard?.id));
  const crossBoard = destinationBoard && destinationBoard.id !== sourceBoard?.id;
  const labelIds = crossBoard && (!copy || draft.keep?.labels) ? [...new Set(sourceCards.flatMap(card => card.labelIds))] : [];
  const memberIds = crossBoard && !copy ? [...new Set(sourceCards.flatMap(card => card.memberIds))] : [];
  const destinationMembers = state.users.filter(user => user.boardIds?.includes(destinationBoard?.id ?? ''));
  const title = deletion ? `Permanently delete ${type}` : `${copy ? 'Copy' : 'Move'} ${type}`;
  const destinationValid = deletion || (type === 'board' ? workspaceOptions.some(workspace => workspace.id === draft.destinationWorkspaceId) : boardOptions.some(board => board.id === draft.destinationBoardId) && (type !== 'card' || lists.some(list => list.id === draft.destinationListId)));
  const changeDraft = (updates: Partial<ContentOperationDraft>) => { setDraft(previous => ({ ...previous, ...updates })); setPreview(null); setKey(''); setError(''); };
  const handleFailure = async (failure: unknown) => {
    setError(failure instanceof Error ? failure.message : 'Unable to complete this request.');
    if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) { setAccessLost(true); setPreview(null); await auth.refresh(); }
    else if (failure instanceof ApiError && failure.status === 409) { setPreview(null); setKey(''); }
  };
  const inspect = async () => {
    setPending(true); setError('');
    try { const result = await previewContentOperation(draft); setPreview(result); setKey(crypto.randomUUID()); }
    catch (failure) { await handleFailure(failure); }
    finally { setPending(false); }
  };
  const commit = async () => {
    if (!preview || pending || !key) return;
    setPending(true); setError('');
    try {
      await commitContentOperation({ ...draft, planHash: preview.planHash, ...(deletion ? { confirmation: 'DELETE' as const } : {}) }, key);
      onComplete?.(); onClose(); await auth.refresh();
    } catch (failure) { await handleFailure(failure); }
    finally { setPending(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent showCloseButton={!pending} className="w-[calc(100%-1.5rem)] max-w-xl max-h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden rounded-xl p-4 sm:p-6" style={{ background: 'var(--modal-bg)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
      onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }}>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{accessLost ? 'Access changed. Refresh your session before continuing.' : `${sourceName ?? 'Resource unavailable'}. Review the impact before confirming.`}</DialogDescription>
      <div className="min-h-0 overflow-y-auto space-y-4 p-1">
      {!accessLost && sourceName && <>
        <fieldset disabled={pending} className="min-w-0 space-y-3">
          {copy && <label className="block text-sm">Copy title<input className="mt-1 w-full rounded border bg-background p-2" value={draft.title ?? ''} maxLength={200} onChange={event => changeDraft({ title: event.target.value })} /></label>}
          {!deletion && type === 'board' && <label className="block text-sm">Destination workspace<select aria-label="Destination workspace" className="mt-1 w-full rounded border bg-background p-2" value={draft.destinationWorkspaceId ?? ''} onChange={event => changeDraft({ destinationWorkspaceId: event.target.value })}>
            {!workspaceOptions.length && <option value="">No eligible destination workspace</option>}{workspaceOptions.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select></label>}
          {!deletion && type !== 'board' && <label className="block text-sm">Destination board<select aria-label="Destination board" className="mt-1 w-full rounded border bg-background p-2" value={draft.destinationBoardId ?? ''} onChange={event => changeDraft({ destinationBoardId: event.target.value, destinationListId: state.lists.find(list => list.boardId === event.target.value && !list.archived)?.id ?? '', labelMap: [], memberMap: [] })}>
            {!boardOptions.length && <option value="">No eligible destination board</option>}{boardOptions.map(board => <option key={board.id} value={board.id}>{state.workspaces.find(workspace => workspace.id === board.workspaceId)?.name} / {board.title}</option>)}
          </select></label>}
          {!deletion && type === 'card' && <label className="block text-sm">Destination list<select aria-label="Destination list" className="mt-1 w-full rounded border bg-background p-2" value={draft.destinationListId ?? ''} onChange={event => changeDraft({ destinationListId: event.target.value })}>{!lists.length && <option value="">No eligible destination list</option>}{lists.map(list => <option key={list.id} value={list.id}>{list.title}</option>)}</select></label>}
          {!deletion && type !== 'board' && <label className="block text-sm">Position (first is 1)<input type="number" min={1} max={1000001} className="mt-1 w-full rounded border bg-background p-2" value={(draft.position ?? 0) + 1} onChange={event => changeDraft({ position: Math.max(0, Number(event.target.value) - 1) })} /></label>}
          {copy && draft.keep && <fieldset className="space-y-2 rounded border p-3"><legend className="px-1 text-sm font-medium">Content to keep</legend>{([
            ['cards', 'Cards'], ['descriptions', 'Descriptions'], ['checklists', 'Checklists'], ['checklistCompletion', 'Checklist completion'], ['labels', 'Labels'], ['dueDates', 'Due dates'], ['dueCompletion', 'Due completion'], ['attachments', 'Attachment references (requires attachment ownership support)'],
          ] as const).filter(([option]) => type !== 'card' || option !== 'cards').map(([option, label]) => <label key={option} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.keep?.[option] ?? false} onChange={event => changeDraft({ keep: { ...draft.keep!, [option]: event.target.checked } })} />{label}</label>)}</fieldset>}
          {copy && type === 'board' && <label className="block text-sm">Board color<input type="color" aria-label="Board color" value={draft.color ?? sourceBoard?.color ?? '#6366f1'} onChange={event => changeDraft({ color: event.target.value })} className="mt-1 h-11 w-full rounded border bg-background" /></label>}
          {copy && type === 'board' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isTemplate ?? false} onChange={event => changeDraft({ isTemplate: event.target.checked })} />Save as private template</label>}
          {labelIds.map(sourceLabelId => <label key={sourceLabelId} className="block text-sm">Map label {sourceBoard?.labels.find(label => label.id === sourceLabelId)?.name || sourceLabelId}<select aria-label={`Map label ${sourceBoard?.labels.find(label => label.id === sourceLabelId)?.name || sourceLabelId}`} className="mt-1 w-full rounded border bg-background p-2" value={draft.labelMap?.find(entry => entry.sourceId === sourceLabelId)?.destinationId ?? (draft.labelMap?.some(entry => entry.sourceId === sourceLabelId) ? '__drop' : '')} onChange={event => changeDraft({ labelMap: [...(draft.labelMap ?? []).filter(entry => entry.sourceId !== sourceLabelId), { sourceId: sourceLabelId, destinationId: event.target.value === '__drop' ? null : event.target.value }] })}>
            <option value="" disabled>Choose a label or explicitly drop</option><option value="__drop">Drop this label</option>{destinationBoard?.labels.map(label => <option key={label.id} value={label.id}>{label.name || 'Color-only label'}</option>)}
          </select></label>)}
          {memberIds.map(sourceMemberId => <label key={sourceMemberId} className="block text-sm">Map member {state.users.find(user => user.id === sourceMemberId)?.name ?? 'Former member'}<select aria-label={`Map member ${state.users.find(user => user.id === sourceMemberId)?.name ?? 'Former member'}`} className="mt-1 w-full rounded border bg-background p-2" value={draft.memberMap?.find(entry => entry.sourceId === sourceMemberId)?.destinationId ?? (draft.memberMap?.some(entry => entry.sourceId === sourceMemberId) ? '__drop' : '')} onChange={event => changeDraft({ memberMap: [...(draft.memberMap ?? []).filter(entry => entry.sourceId !== sourceMemberId), { sourceId: sourceMemberId, destinationId: event.target.value === '__drop' ? null : event.target.value }] })}>
            <option value="" disabled>Choose a Member or explicitly drop</option><option value="__drop">Drop this assignment</option>{destinationMembers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select></label>)}
        </fieldset>
        {preview && <section aria-label="Impact preview" className="space-y-2 rounded border p-3 text-sm">
          <h3 className="font-semibold">Impact preview</h3><dl className="grid grid-cols-2 gap-2">{Object.entries(preview.counts).map(([name, count]) => <div key={name} className="min-w-0 break-words"><dt>{name.replace(/([A-Z])/g, ' $1')}</dt><dd className="font-semibold">{count}</dd></div>)}</dl>
          {preview.warnings.map(warning => <p key={warning}>{warning}</p>)}
          {preview.audience && Object.entries(preview.audience).map(([name, users]) => <p key={name}>{name.replace(/([A-Z])/g, ' $1')}: {users.map(user => user.name).join(', ') || 'None'}</p>)}
          {preview.unresolvedMappings.length > 0 && <p role="alert">Resolve every label and member mapping, then preview again.</p>}
          <p>Preview expires {new Date(preview.expiresAt).toLocaleTimeString()}.</p>
        </section>}
        {deletion && <label className="block text-sm">Type DELETE to confirm<input className="mt-1 w-full rounded border bg-background p-2" autoComplete="off" value={confirmation} disabled={pending} onChange={event => setConfirmation(event.target.value)} /></label>}
      </>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {pending && <p role="status">Processing {copy ? 'copy' : deletion ? 'deletion' : 'move'}…</p>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
        {!accessLost && <><Button variant="outline" disabled={pending || !sourceName || !destinationValid || (copy && !draft.title?.trim())} onClick={() => void inspect()}>Preview impact</Button>
          <Button variant={deletion ? 'destructive' : 'default'} disabled={pending || !preview || !destinationValid || preview.unresolvedMappings.length > 0 || (deletion && confirmation !== 'DELETE')} onClick={() => void commit()}>{deletion ? 'Delete permanently' : copy ? 'Confirm copy' : 'Confirm move'}</Button></>}
      </div>
    </DialogContent>
  </Dialog>;
}
import { useRef, useState } from 'react';
import { useAppState } from '../store';
import { useAuth } from '../lib/auth-context';
import { ApiError } from '../services/api';
import { commitContentOperation, previewContentOperation, type ContentOperationDraft, type ContentPreview } from '../services/content';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
