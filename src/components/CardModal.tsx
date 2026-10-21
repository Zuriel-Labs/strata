import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AlignLeft, CheckSquare, Clock3, Download, Eye, EyeOff, MessageSquare, Paperclip, Plus, Settings2, Tag, Trash2, Users, X } from 'lucide-react';
import { uid } from '../data';
import { createCardCommentApi, deleteCardCommentApi, duplicateCardApi, updateBoardLabelsApi, updateCardApi, updateCardCommentApi, moveCardApi } from '../services/data';
import { useAppState, useDispatch } from '../store';
import { useAuth } from '../lib/auth-context';
import type { Attachment, Checklist, RichTextDocument } from '../types';
import { toast } from '../hooks/use-toast';
import { RichTextEditor } from './RichTextEditor';
import { RichTextRenderer } from './RichTextRenderer';
import { LabelEditor } from './LabelEditor';
import { ContentOperationDialog, type ContentOperationDialogProps } from './ContentOperationDialog';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog';
import { normalizeDateOnly } from '../lib/date-only';

type OptionalSectionKey = 'members' | 'labels' | 'dueDate' | 'attachments';

const INLINE_ATTACHMENT_MIME_TYPES = new Set([
  'application/json',
  'application/pdf',
  'application/xml',
]);

const INLINE_ATTACHMENT_MIME_PREFIXES = ['audio/', 'image/', 'text/', 'video/'];

function hasFilePayload(attachment: Attachment) {
  return attachment.kind === 'file' && Boolean(attachment.url);
}

function canViewFileAttachment(attachment: Attachment) {
  if (!hasFilePayload(attachment) || !attachment.mimeType) return false;

  return INLINE_ATTACHMENT_MIME_PREFIXES.some(prefix => attachment.mimeType?.startsWith(prefix))
    || INLINE_ATTACHMENT_MIME_TYPES.has(attachment.mimeType);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error(`Unable to read file payload for ${file.name}.`));
    };

    reader.onerror = () => reject(reader.error ?? new Error(`Unable to read file payload for ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function getUserDisplay(state: ReturnType<typeof useAppState>, userId: string) {
  if (userId === 'system') {
    return { name: 'System', initials: 'SY', color: '#64748b' };
  }

  return state.users.find(user => user.id === userId) ?? { name: 'Deleted user', initials: 'DU', color: '#6b7280' };
}

export function CardModal() {
  const state = useAppState();
  const dispatch = useDispatch();
  const auth = useAuth();
  const card = state.cards.find(candidate => candidate.id === state.activeCardId);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [descEditing, setDescEditing] = useState(false);
  const [descDocument, setDescDocument] = useState<RichTextDocument | null>(null);
  const [descPending, setDescPending] = useState(false);
  const [descError, setDescError] = useState('');
  const [comment, setComment] = useState('');
  const [commentPending, setCommentPending] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [attachmentLink, setAttachmentLink] = useState('');
  const [titleEditing, setTitleEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [labelManagerBaselineIds, setLabelManagerBaselineIds] = useState<string[]>([]);
  const [labelQuery, setLabelQuery] = useState('');
  const [labelAssignmentPendingId, setLabelAssignmentPendingId] = useState<string | null>(null);
  const [labelAssignmentError, setLabelAssignmentError] = useState('');
  const [operation, setOperation] = useState<ContentOperationDialogProps['kind'] | null>(null);
  const [archivePending, setArchivePending] = useState(false);
  const [duplicatePending, setDuplicatePending] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');
  const [duplicateStatus, setDuplicateStatus] = useState('');
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingChecklistTitle, setEditingChecklistTitle] = useState('');
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState('');
  const [checklistPending, setChecklistPending] = useState(false);
  const [checklistError, setChecklistError] = useState('');
  const [revealedSections, setRevealedSections] = useState<Record<OptionalSectionKey, boolean>>({
    members: false,
    labels: false,
    dueDate: false,
    attachments: false,
  });

  useEffect(() => {
    if (titleEditing && card) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [card, titleEditing]);

  if (!card) return null;

  const board = state.boards.find(candidate => candidate.id === card.boardId);
  const list = state.lists.find(candidate => candidate.id === card.listId);
  const labels = board?.labels ?? [];
  const visiblePickerLabels = labels.filter(label => label.name.toLowerCase().includes(labelQuery.trim().toLowerCase()));
  const members = state.users.filter(user => card.memberIds.includes(user.id));
  const availableMembers = state.users.filter(user => (!user.boardIds || user.boardIds.includes(card.boardId)) && !card.memberIds.includes(user.id));
  const lists = state.lists
    .filter(candidate => candidate.boardId === card.boardId && !candidate.archived)
    .sort((a, b) => a.position - b.position);
  const totalChecklistItems = card.checklists.reduce((total, checklist) => total + checklist.items.length, 0);
  const completedChecklistItems = card.checklists.reduce(
    (total, checklist) => total + checklist.items.filter(item => item.completed).length,
    0,
  );
  const checklistProgress = totalChecklistItems > 0
    ? Math.round((completedChecklistItems / totalChecklistItems) * 100)
    : 0;
  const currentUser = state.users.find(user => user.id === state.currentUserId) ?? state.users[0] ?? null;
  const canEditCard = auth.canEditBoardCards(card.boardId) && !card.archived && !list?.archived;
  const canCollaborate = canEditCard && !state.boards.find(board => board.id === card.boardId)?.isTemplate;
  const canDeleteCard = auth.canArchiveBoardContent(card.boardId) && !card.archived && !list?.archived;
  const canCopyCard = !card.archived && !list?.archived && board?.lifecycleState !== 'closed' && state.workspaces.find(workspace => workspace.id === board?.workspaceId)?.lifecycleState !== 'closed';
  const canPermanentlyDeleteCard = auth.canManageBoard(card.boardId) && card.archived;
  const canManageLabels = auth.canManageBoardLabels(card.boardId);
  const hiddenSectionButtons = canEditCard ? [
    { key: 'members' as const, label: 'Members', icon: Users, visible: card.memberIds.length > 0 || revealedSections.members },
    { key: 'dueDate' as const, label: 'Dates', icon: Clock3, visible: Boolean(card.dueDate) || revealedSections.dueDate },
    { key: 'attachments' as const, label: 'Attachment', icon: Paperclip, visible: card.attachments.length > 0 || revealedSections.attachments },
  ].filter(section => !section.visible && (section.key !== 'members' || canCollaborate)) : [];

  const close = () => dispatch({ type: 'SET_ACTIVE_CARD', payload: null });
  const closeLabelPicker = () => {
    setLabelPickerOpen(false);
    setLabelManagerOpen(false);
    setLabelQuery('');
    setLabelAssignmentError('');
  };

  const persistCard = (updates: Record<string, unknown>) => {
    if (!canEditCard) return;
    dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, ...updates } });
    void updateCardApi(card.id, updates).catch(error => restoreFromServer(
      'Card change not saved',
      error instanceof Error ? error.message : 'The card change could not be saved.',
    ));
  };

  const toggleCardLabel = async (labelId: string) => {
    if (!canEditCard || labelAssignmentPendingId) return;
    const previousLabelIds = card.labelIds;
    const nextLabelIds = previousLabelIds.includes(labelId)
      ? previousLabelIds.filter(currentId => currentId !== labelId)
      : [...previousLabelIds, labelId];

    setLabelAssignmentPendingId(labelId);
    setLabelAssignmentError('');
    dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, labelIds: nextLabelIds } });
    try {
      const updated = await updateCardApi(card.id, { labelIds: nextLabelIds });
      dispatch({ type: 'APPLY_CARD_FROM_API', payload: updated });
    } catch (error) {
      dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, labelIds: previousLabelIds } });
      const message = error instanceof Error ? error.message : 'The card label could not be updated.';
      setLabelAssignmentError(message);
      toast({ title: 'Label assignment not saved', description: message, variant: 'destructive' });
    } finally {
      setLabelAssignmentPendingId(null);
    }
  };

  const getWatchingForMemberChange = (nextMemberIds: string[]) => {
    const wasCurrentUserMember = card.memberIds.includes(state.currentUserId);
    const isCurrentUserMember = nextMemberIds.includes(state.currentUserId);
    if (!wasCurrentUserMember && isCurrentUserMember) return true;
    if (wasCurrentUserMember && !isCurrentUserMember) return false;
    return card.watching;
  };

  const revealSection = (section: OptionalSectionKey) => {
    setRevealedSections(current => ({ ...current, [section]: true }));
  };

  const restoreFromServer = async (title: string, description: string) => {
    toast({
      title,
      description,
      variant: 'destructive',
    });
    await auth.refresh();
  };

  const handleDuplicateCard = async () => {
    if (!canEditCard || duplicatePending) return;
    const sourceCardId = card.id;
    setDuplicatePending(true);
    setDuplicateError('');
    setDuplicateStatus('');
    try {
      const duplicate = await duplicateCardApi(sourceCardId);
      dispatch({ type: 'ADD_DUPLICATED_CARD_FROM_API', payload: { sourceCardId, card: duplicate } });
      setDuplicateStatus('Card duplicated successfully.');
      toast({ title: 'Card duplicated', description: `Opened “${duplicate.title}”.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The card could not be duplicated.';
      setDuplicateError(message);
      toast({ title: 'Card not duplicated', description: message, variant: 'destructive' });
    } finally {
      setDuplicatePending(false);
    }
  };

  const handleMoveList = (nextListId: string) => {
    if (!canEditCard || !nextListId || nextListId === card.listId) return;
    dispatch({ type: 'MOVE_CARD', payload: { cardId: card.id, toListId: nextListId, toPosition: 0 } });
    moveCardApi(card.id, nextListId, 0);
  };

  const handleToggleWatch = () => {
    if (!canEditCard) return;
    persistCard({ watching: !card.watching });
  };

  const beginTitleEdit = () => {
    if (!canEditCard) return;
    setDraftTitle(card.title);
    setTitleEditing(true);
  };

  const commitTitle = () => {
    if (!canEditCard) return;
    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      setDraftTitle(card.title);
      setTitleEditing(false);
      return;
    }
    if (nextTitle !== card.title) {
      persistCard({ title: nextTitle });
    }
    setTitleEditing(false);
  };

  const cancelTitleEdit = () => {
    setDraftTitle(card.title);
    setTitleEditing(false);
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitTitle();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelTitleEdit();
    }
  };

  const handleMemberChange = (nextMemberIds: string[]) => {
    if (!canEditCard) return;
    revealSection('members');
    persistCard({ memberIds: nextMemberIds, watching: getWatchingForMemberChange(nextMemberIds) });
  };

  const beginDescriptionEdit = () => {
    if (!canEditCard) return;
    setDescDocument(card.descriptionDocument);
    setDescError('');
    setDescEditing(true);
  };

  const cancelDescriptionEdit = () => {
    if (descPending) return;
    setDescDocument(card.descriptionDocument);
    setDescError('');
    setDescEditing(false);
  };

  const saveDescription = async () => {
    if (!descDocument || descPending) return;
    setDescPending(true);
    setDescError('');
    try {
      const updatedCard = await updateCardApi(card.id, { descriptionDocument: descDocument });
      dispatch({ type: 'APPLY_CARD_FROM_API', payload: updatedCard });
      setDescDocument(updatedCard.descriptionDocument);
      setDescEditing(false);
    } catch (error) {
      setDescError(error instanceof Error ? error.message : 'The Description could not be saved.');
    } finally {
      setDescPending(false);
    }
  };

  const saveLabelsInCard = async (nextLabels: typeof labels) => {
    if (!board) throw new Error('Board not found.');
    const result = await updateBoardLabelsApi(board.id, nextLabels, board.labelsRevision);
    dispatch({ type: 'UPDATE_BOARD_LABELS', payload: result });

    const validIds = new Set(result.labels.map(label => label.id));
    const baselineIds = new Set(labelManagerBaselineIds);
    const createdIds = result.labels.filter(label => !baselineIds.has(label.id)).map(label => label.id);
    const nextCardLabelIds = [...new Set([
      ...card.labelIds.filter(labelId => validIds.has(labelId)),
      ...createdIds,
    ])];
    if (createdIds.length > 0) {
      const updatedCard = await updateCardApi(card.id, { labelIds: nextCardLabelIds });
      dispatch({ type: 'APPLY_CARD_FROM_API', payload: updatedCard });
    }
    setLabelManagerOpen(false);
    setLabelQuery('');
  };

  const persistChecklists = async (nextChecklists: Checklist[], onSuccess?: () => void) => {
    if (!canEditCard || checklistPending) return;
    setChecklistPending(true);
    setChecklistError('');
    try {
      const updatedCard = await updateCardApi(card.id, { checklists: nextChecklists });
      dispatch({ type: 'APPLY_CARD_FROM_API', payload: updatedCard });
      onSuccess?.();
    } catch (error) {
      setChecklistError(error instanceof Error ? error.message : 'The checklist change could not be saved.');
    } finally {
      setChecklistPending(false);
    }
  };

  const createChecklist = () => {
    const title = newChecklistTitle.trim();
    if (!title) return;
    const nextChecklist: Checklist = { id: uid(), title, items: [] };
    void persistChecklists([...card.checklists, nextChecklist], () => {
      setNewChecklistTitle('');
      setAddingChecklist(false);
    });
  };

  const addChecklistItem = (checklistId: string) => {
    const text = newItemText.trim();
    if (!text) return;
    const nextChecklists = card.checklists.map(checklist => checklist.id === checklistId
      ? { ...checklist, items: [...checklist.items, { id: uid(), text, completed: false }] }
      : checklist);
    void persistChecklists(nextChecklists, () => {
      setNewItemText('');
      setAddingItemTo(null);
    });
  };

  const toggleChecklistItem = (checklistId: string, itemId: string) => {
    const nextChecklists = card.checklists.map(checklist => checklist.id === checklistId
      ? {
          ...checklist,
          items: checklist.items.map(item => item.id === itemId ? { ...item, completed: !item.completed } : item),
        }
      : checklist);
    void persistChecklists(nextChecklists);
  };

  const deleteChecklistItem = (checklistId: string, itemId: string) => {
    const nextChecklists = card.checklists.map(checklist => checklist.id === checklistId
      ? { ...checklist, items: checklist.items.filter(item => item.id !== itemId) }
      : checklist);
    void persistChecklists(nextChecklists);
  };

  const saveChecklistTitle = (checklistId: string) => {
    const title = editingChecklistTitle.trim();
    if (!title) return;
    const nextChecklists = card.checklists.map(checklist => checklist.id === checklistId
      ? { ...checklist, title }
      : checklist);
    void persistChecklists(nextChecklists, () => {
      setEditingChecklistId(null);
      setEditingChecklistTitle('');
    });
  };

  const deleteChecklist = (checklistId: string) => {
    void persistChecklists(card.checklists.filter(checklist => checklist.id !== checklistId), () => {
      if (editingChecklistId === checklistId) {
        setEditingChecklistId(null);
        setEditingChecklistTitle('');
      }
      if (addingItemTo === checklistId) {
        setAddingItemTo(null);
        setNewItemText('');
      }
    });
  };

  const handleLinkAttachment = async () => {
    if (!canEditCard) return;
    const value = attachmentLink.trim();
    if (!value) return;

    const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const attachment = {
      id: uid(),
      name: value.replace(/^https?:\/\//i, ''),
      kind: 'link' as const,
      url,
      createdAt: new Date().toISOString(),
    };

    dispatch({
      type: 'ADD_ATTACHMENT',
      payload: { cardId: card.id, attachment },
    });
    revealSection('attachments');
    try {
      await updateCardApi(card.id, { attachments: [...card.attachments, attachment] });
    } catch (error) {
      await restoreFromServer(
        'Attachment not saved',
        error instanceof Error ? error.message : 'The link attachment could not be saved.',
      );
      return;
    }
    setAttachmentLink('');
  };

  const handleFileAttachment = async (files: FileList | null) => {
    if (!canEditCard || !files) return;

    const newAttachments = await Promise.all(Array.from(files).map(async file => ({
      id: uid(),
      name: file.name,
      kind: 'file' as const,
      url: await readFileAsDataUrl(file),
      size: file.size,
      mimeType: file.type || undefined,
      createdAt: new Date().toISOString(),
    })));

    newAttachments.forEach(attachment => {
      dispatch({
        type: 'ADD_ATTACHMENT',
        payload: { cardId: card.id, attachment },
      });
    });
    revealSection('attachments');
    try {
      await updateCardApi(card.id, { attachments: [...card.attachments, ...newAttachments] });
    } catch (error) {
      await restoreFromServer(
        'Upload not saved',
        error instanceof Error ? error.message : 'The uploaded files could not be saved.',
      );
      return;
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreateComment = async () => {
    const text = comment.trim();
    if (!canEditCard || !text || commentPending) return;
    setCommentPending(true);
    setCommentError('');
    try {
      const updatedCard = await createCardCommentApi(card.id, text);
      dispatch({ type: 'APPLY_CARD_FROM_API', payload: updatedCard });
      setComment('');
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'The comment could not be added.');
    } finally {
      setCommentPending(false);
    }
  };

  const beginCommentEdit = (commentId: string, text: string) => {
    if (!canEditCard || commentPending) return;
    setEditingCommentId(commentId);
    setEditingCommentText(text);
    setCommentError('');
  };

  const cancelCommentEdit = () => {
    if (commentPending) return;
    setEditingCommentId(null);
    setEditingCommentText('');
    setCommentError('');
  };

  const saveCommentEdit = async () => {
    const text = editingCommentText.trim();
    if (!editingCommentId || !text || commentPending) return;
    setCommentPending(true);
    setCommentError('');
    try {
      const updatedCard = await updateCardCommentApi(card.id, editingCommentId, text);
      dispatch({ type: 'APPLY_CARD_FROM_API', payload: updatedCard });
      setEditingCommentId(null);
      setEditingCommentText('');
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'The comment could not be updated.');
    } finally {
      setCommentPending(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!canDeleteCard || commentPending || deletingCommentId) return;
    setDeletingCommentId(commentId);
    setCommentError('');
    try {
      const updatedCard = await deleteCardCommentApi(card.id, commentId);
      dispatch({ type: 'APPLY_CARD_FROM_API', payload: updatedCard });
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'The comment could not be deleted.');
    } finally {
      setDeletingCommentId(null);
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={event => {
        if (event.target === overlayRef.current) close();
      }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-3 py-6 sm:px-6 sm:py-10"
      style={{ background: 'rgba(5, 7, 12, 0.72)', backdropFilter: 'blur(8px)' }}
    >
      <div className="relative w-full max-w-3xl overflow-hidden rounded-[24px] border shadow-2xl" style={{ background: 'var(--modal-bg)', borderColor: 'rgba(255,255,255,0.06)' }}>
        {labelPickerOpen && (
          <div data-testid="labels-panel-backdrop" className="absolute inset-0 z-10" onClick={closeLabelPicker} aria-hidden="true" />
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5" style={{ borderColor: 'var(--border)' }}>
          <select
            aria-label="Card list"
            value={card.listId}
            disabled={!canEditCard}
            onChange={event => handleMoveList(event.target.value)}
            className="min-h-[40px] rounded-md border px-3 text-sm font-medium outline-none"
            style={{ background: '#2a2d36', borderColor: 'transparent', color: 'var(--text-primary)' }}
          >
            {lists.map(candidate => (
              <option key={candidate.id} value={candidate.id}>{candidate.title}</option>
            ))}
          </select>

          <div className="flex flex-wrap items-center gap-2">
            {(canCopyCard || canEditCard || canDeleteCard || canPermanentlyDeleteCard) && <Dialog key={card.id}>
              <DialogTrigger asChild>
                <button type="button" aria-label="Manage current card" title="Manage current card" className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 focus-visible:outline focus-visible:outline-2" style={{ color: 'var(--text-secondary)', background: 'var(--active-bg)' }}><Settings2 size={16} /></button>
              </DialogTrigger>
              <DialogContent className="w-[calc(100%-1.5rem)] max-w-sm max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-xl p-4" style={{ background: 'var(--modal-bg)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}>
                <DialogTitle className="text-base">Card management</DialogTitle>
                <DialogDescription className="break-words">{card.title}</DialogDescription>
                <div className="flex min-w-0 flex-col gap-2">
                  {canEditCard && <Button size="sm" variant="outline" disabled={duplicatePending} onClick={() => void handleDuplicateCard()}>Duplicate card</Button>}
                  {canCopyCard && <Button size="sm" variant="outline" onClick={() => setOperation('card_copy')}>Copy with options</Button>}
                  {canEditCard && <Button size="sm" variant="outline" onClick={() => setOperation('card_move')}>Transfer card</Button>}
                  {canDeleteCard && !card.archived && <Button size="sm" variant="outline" disabled={archivePending} onClick={async () => {
                    setArchivePending(true);
                    try { const updated = await updateCardApi(card.id, { archived: true }); dispatch({ type: 'APPLY_CARD_FROM_API', payload: updated }); close(); await auth.refresh(); }
                    catch (failure) { toast({ title: 'Card not archived', description: failure instanceof Error ? failure.message : 'Unable to archive card.', variant: 'destructive' }); }
                    finally { setArchivePending(false); }
                  }}>Archive card</Button>}
                  {canPermanentlyDeleteCard && <Button size="sm" variant="destructive" onClick={() => setOperation('delete')}>Delete archived card</Button>}
                  {duplicateError && <p role="alert" className="text-sm text-red-400">{duplicateError}</p>}
                  {operation && <ContentOperationDialog kind={operation} resourceType={operation === 'delete' ? 'card' : undefined} sourceId={card.id} onClose={() => setOperation(null)} onComplete={() => { if (operation === 'delete' || operation === 'card_move') close(); }} />}
                </div>
              </DialogContent>
            </Dialog>}
            {canCollaborate && <button
              aria-label={card.watching ? 'Stop watching card' : 'Watch card'}
              onClick={handleToggleWatch}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-opacity hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.06)', color: card.watching ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            >
              {card.watching ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>}
            <button
              aria-label="Close card"
              onClick={close}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-opacity hover:opacity-80"
              style={{ background: 'transparent', color: 'var(--text-secondary)' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-4 pb-5 pt-5 sm:px-6 sm:pb-6">
          {duplicateStatus && <p role="status" className="mb-3 rounded-md px-3 py-2 text-sm" style={{ background: 'var(--active-bg)', color: 'var(--text-secondary)' }}>{duplicateStatus}</p>}
          <div className="mb-5 min-w-0">
            {titleEditing ? (
              <input
                ref={titleInputRef}
                aria-label="Card title"
                value={draftTitle}
                onChange={event => setDraftTitle(event.target.value)}
                onBlur={commitTitle}
                onKeyDown={handleTitleKeyDown}
                className="w-full border-none bg-transparent text-[2rem] font-bold leading-tight outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
            ) : canEditCard ? (
              <button
                type="button"
                onClick={beginTitleEdit}
                className="w-full text-left text-[2rem] font-bold leading-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {card.title}
              </button>
            ) : (
              <h2 className="text-[2rem] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{card.title}</h2>
            )}
            {list && (
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                In list <span style={{ color: 'var(--text-primary)' }}>{list.title}</span>
              </p>
            )}
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
              {hiddenSectionButtons.map(section => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => revealSection(section.key)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors"
                    style={{ background: 'transparent', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    <Plus size={16} />
                    <Icon size={15} />
                    {section.label}
                  </button>
                );
              })}
              {canEditCard && <button
                type="button"
                onClick={() => {
                  revealSection('labels');
                  setLabelPickerOpen(current => !current);
                  setLabelQuery('');
                }}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors"
                style={{ background: labelPickerOpen ? 'var(--active-bg)' : 'transparent', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <Tag size={15} />
                Labels
              </button>}
          </div>

          {labelPickerOpen && (
            <div
              className={`absolute right-4 top-32 z-20 rounded-2xl border p-3 shadow-2xl ${labelManagerOpen ? 'w-[min(36rem,calc(100%-2rem))]' : 'w-[min(22rem,calc(100%-2rem))]'}`}
              style={{ background: 'var(--dropdown-bg)', borderColor: 'var(--border)' }}
              onClick={event => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                {labelManagerOpen ? (
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Manage labels</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Changes update every card on this board.</p>
                  </div>
                ) : (
                  <input
                    value={labelQuery}
                    onChange={event => setLabelQuery(event.target.value)}
                    placeholder="Search labels"
                    className="min-h-[44px] w-full rounded-md border px-3 text-sm outline-none"
                    style={{ background: 'transparent', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                )}
                <button
                  type="button"
                  aria-label="Close labels panel"
                  onClick={closeLabelPicker}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'var(--active-bg)', color: 'var(--text-secondary)' }}
                >
                  <X size={16} />
                </button>
              </div>
              {labelManagerOpen ? (
                <LabelEditor
                  key={board?.labelsRevision ?? 0}
                  autoFocus
                  labels={labels}
                  maxLabelsPerBoard={state.maxLabelsPerBoard}
                  onReload={auth.refresh}
                  usageCount={labelId => state.cards.filter(candidate => candidate.boardId === card.boardId && candidate.labelIds.includes(labelId)).length}
                  onCancel={() => setLabelManagerOpen(false)}
                  onSave={saveLabelsInCard}
                />
              ) : <>
              {labelAssignmentError && <p role="alert" className="mb-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">{labelAssignmentError}</p>}
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {visiblePickerLabels.map(label => {
                  const active = card.labelIds.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      aria-pressed={active}
                      disabled={!canEditCard || Boolean(labelAssignmentPendingId)}
                      onClick={() => {
                        revealSection('labels');
                        void toggleCardLabel(label.id);
                      }}
                      className="flex min-h-[44px] items-center justify-between rounded-md px-3 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-60"
                      style={{ background: label.color }}
                    >
                      <span>{label.name}</span>
                      <span>{active ? 'Added' : 'Add'}</span>
                    </button>
                  );
                })}
                {visiblePickerLabels.length === 0 && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No labels match your search.</p>}
              </div>
              {canManageLabels && (
                <button
                  type="button"
                  aria-label="Manage labels in card"
                  onClick={() => {
                    setLabelManagerBaselineIds(labels.map(label => label.id));
                    setLabelManagerOpen(true);
                  }}
                  className="mt-3 min-h-[44px] w-full rounded-md border text-sm font-semibold"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >Create, edit, or delete labels</button>
              )}
              </>}
            </div>
          )}

          {(card.memberIds.length > 0 || revealedSections.members) && (
            <section className="mb-5">
              <SectionHeading icon={Users} title="Members" />
              <div className="flex flex-wrap items-center gap-2">
                {members.map(member => (
                  <button
                    key={member.id}
                    type="button"
                    disabled={!canCollaborate}
                    onClick={() => handleMemberChange(card.memberIds.filter(id => id !== member.id))}
                    className="inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-default disabled:opacity-100"
                    style={{ background: member.color }}
                    title={canEditCard ? `Remove ${member.name}` : member.name}
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-[11px] font-bold">{member.initials}</span>
                  </button>
                ))}
                {canCollaborate && availableMembers.length > 0 && (
                  <select
                    aria-label="Add member"
                    value=""
                    onChange={event => {
                      if (event.target.value) handleMemberChange([...card.memberIds, event.target.value]);
                    }}
                    className="min-h-[44px] rounded-full border px-3 text-sm outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    <option value="">+ Add member</option>
                    {availableMembers.map(member => (
                      <option key={member.id} value={member.id}>{member.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </section>
          )}

          {(card.labelIds.length > 0 || revealedSections.labels) && (
            <section className="mb-5">
              <div className="flex flex-wrap gap-2">
                {labels.filter(label => card.labelIds.includes(label.id)).map(label => {
                  const isColorOnly = label.name.trim().length === 0;
                  return (
                  <button
                    key={label.id}
                    type="button"
                    aria-label={isColorOnly ? 'Color-only label' : label.name}
                    disabled={!canEditCard}
                    onClick={() => {
                      revealSection('labels');
                      persistCard({ labelIds: card.labelIds.filter(id => id !== label.id) });
                    }}
                    className={isColorOnly
                      ? 'inline-flex h-11 w-11 items-center justify-center rounded-md disabled:cursor-default'
                      : 'inline-flex min-h-[44px] items-center rounded-md px-3 text-sm font-semibold text-white disabled:cursor-default'}
                    style={{ background: label.color }}
                    title={isColorOnly ? (canEditCard ? 'Remove color-only label' : 'Color-only label') : (canEditCard ? `Remove ${label.name}` : label.name)}
                  >
                    {!isColorOnly ? label.name : null}
                  </button>
                  );
                })}
              </div>
            </section>
          )}

          {(card.dueDate || revealedSections.dueDate) && (
            <section className="mb-5">
              <SectionHeading icon={Clock3} title="Due date" />
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="date"
                  aria-label="Card due date"
                  disabled={!canEditCard}
                  value={normalizeDateOnly(card.dueDate) ?? ''}
                  onChange={event => {
                    const dueDate = normalizeDateOnly(event.target.value);
                    revealSection('dueDate');
                    persistCard({ dueDate });
                  }}
                  className="min-h-[44px] rounded-md border px-3 text-sm outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                {card.dueDate && (
                  <label className="inline-flex min-h-[44px] items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={card.dueDateComplete}
                      disabled={!canEditCard}
                      onChange={() => persistCard({ dueDateComplete: !card.dueDateComplete })}
                      className="rounded"
                    />
                    Complete
                  </label>
                )}
                {card.dueDate && canEditCard && (
                  <button
                    type="button"
                    aria-label="Remove due date"
                    onClick={() => persistCard({ dueDate: null, dueDateComplete: false })}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-md px-3 text-sm font-medium disabled:opacity-50"
                    style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
                  >
                    <Trash2 size={16} /> Remove
                  </button>
                )}
              </div>
            </section>
          )}

          <section className="mb-5">
            <SectionHeading icon={AlignLeft} title="Description" />
            {descEditing ? (
              <div>
                <RichTextEditor
                  autoFocus
                  disabled={descPending}
                  value={descDocument ?? card.descriptionDocument}
                  onChange={setDescDocument}
                />
                {descError && <p role="alert" className="mt-2 text-sm text-red-400">{descError}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-label="Save description"
                    disabled={descPending}
                    onClick={() => void saveDescription()}
                    className="min-h-[44px] rounded-md px-4 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-60"
                    style={{ background: 'var(--accent)' }}
                  >
                    {descPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel description editing"
                    disabled={descPending}
                    onClick={cancelDescriptionEdit}
                    className="min-h-[44px] px-2 text-sm"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`group/description relative min-h-[88px] w-full rounded-xl border px-4 py-3 text-left text-sm ${canEditCard ? 'cursor-text' : ''}`}
                style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)', color: card.description ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                onClick={event => {
                  if (!canEditCard || (event.target as HTMLElement).closest('a')) return;
                  beginDescriptionEdit();
                }}
              >
                {card.description
                  ? <RichTextRenderer document={card.descriptionDocument} className={canEditCard ? 'pr-14' : undefined} />
                  : 'Add a more detailed description...'}
                {canEditCard && (
                  <button
                    type="button"
                    aria-label="Edit description"
                    onClick={event => {
                      event.stopPropagation();
                      beginDescriptionEdit();
                    }}
                    className="absolute right-3 top-3 min-h-[40px] rounded-md px-3 text-xs font-semibold opacity-70 transition-opacity hover:opacity-100 focus:opacity-100"
                    style={{ background: 'var(--active-bg)', color: 'var(--text-secondary)' }}
                  >Edit</button>
                )}
              </div>
            )}
          </section>

          {(card.checklists.length > 0 || canEditCard) && (
            <section className="mb-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <SectionHeading icon={CheckSquare} title="Checklists" className="mb-0" />
                {canEditCard && !addingChecklist && (
                  <button
                    type="button"
                    disabled={checklistPending}
                    onClick={() => {
                      setChecklistError('');
                      setAddingChecklist(true);
                    }}
                    className="min-h-[44px] rounded-md px-3 text-sm font-semibold disabled:opacity-50"
                    style={{ background: 'var(--active-bg)', color: 'var(--accent)' }}
                  >Add checklist</button>
                )}
              </div>

              {totalChecklistItems > 0 && (
                <div className="mb-4 flex items-center gap-3" aria-label={`${checklistProgress}% checklist complete`}>
                  <span className="w-10 text-xs font-bold" style={{ color: checklistProgress === 100 ? '#22c55e' : 'var(--text-secondary)' }}>{checklistProgress}%</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{ width: `${checklistProgress}%`, background: checklistProgress === 100 ? '#22c55e' : 'var(--accent)' }}
                    />
                  </div>
                </div>
              )}

              {checklistError && <p role="alert" className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">{checklistError}</p>}

              {addingChecklist && canEditCard && (
                <div className="mb-4 flex flex-col gap-2 rounded-xl border p-3 sm:flex-row" style={{ borderColor: 'var(--border)' }}>
                  <input
                    autoFocus
                    value={newChecklistTitle}
                    disabled={checklistPending}
                    onChange={event => setNewChecklistTitle(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        createChecklist();
                      }
                      if (event.key === 'Escape') {
                        setAddingChecklist(false);
                        setNewChecklistTitle('');
                      }
                    }}
                    placeholder="Checklist title"
                    className="min-h-[44px] flex-1 rounded-md border px-3 text-sm outline-none disabled:opacity-50"
                    style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  <button type="button" disabled={checklistPending || !newChecklistTitle.trim()} onClick={createChecklist} className="min-h-[44px] rounded-md px-4 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>Save checklist</button>
                  <button type="button" disabled={checklistPending} onClick={() => { setAddingChecklist(false); setNewChecklistTitle(''); }} className="min-h-[44px] px-3 text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
                </div>
              )}

              <div className="space-y-4">
                {card.checklists.map(checklist => (
                  <div key={checklist.id} className="rounded-xl border p-3" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)' }}>
                    {editingChecklistId === checklist.id && canEditCard ? (
                      <div className="mb-2 flex flex-col gap-2 sm:flex-row">
                        <input
                          autoFocus
                          aria-label={`Checklist title ${checklist.title}`}
                          value={editingChecklistTitle}
                          disabled={checklistPending}
                          onChange={event => setEditingChecklistTitle(event.target.value)}
                          onKeyDown={event => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              saveChecklistTitle(checklist.id);
                            }
                            if (event.key === 'Escape') {
                              setEditingChecklistId(null);
                              setEditingChecklistTitle('');
                            }
                          }}
                          className="min-h-[44px] flex-1 rounded-md border px-3 text-sm outline-none disabled:opacity-50"
                          style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        />
                        <button type="button" aria-label="Save checklist title" disabled={checklistPending || !editingChecklistTitle.trim()} onClick={() => saveChecklistTitle(checklist.id)} className="min-h-[44px] rounded-md px-3 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>Save</button>
                        <button type="button" disabled={checklistPending} onClick={() => { setEditingChecklistId(null); setEditingChecklistTitle(''); }} className="min-h-[44px] px-3 text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
                      </div>
                    ) : (
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{checklist.title}</h4>
                        {canEditCard && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Edit checklist ${checklist.title}`}
                              disabled={checklistPending}
                              onClick={() => {
                                setChecklistError('');
                                setEditingChecklistId(checklist.id);
                                setEditingChecklistTitle(checklist.title);
                              }}
                              className="min-h-[44px] rounded-md px-3 text-xs font-semibold disabled:opacity-50"
                              style={{ color: 'var(--accent)' }}
                            >Edit</button>
                            <button
                              type="button"
                              aria-label={`Delete checklist ${checklist.title}`}
                              disabled={checklistPending}
                              onClick={() => deleteChecklist(checklist.id)}
                              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md disabled:opacity-50"
                              style={{ color: '#ef4444' }}
                            ><Trash2 size={16} /></button>
                          </div>
                        )}
                      </div>
                    )}
                    {checklist.items.length === 0 && addingItemTo !== checklist.id && (
                      <p className="mb-2 text-sm" style={{ color: 'var(--text-secondary)' }}>No items yet.</p>
                    )}
                    <div className="space-y-1">
                      {checklist.items.map(item => (
                        <div key={item.id} className="flex min-h-[44px] items-center gap-3 rounded-md px-2">
                          <input
                            type="checkbox"
                            aria-label={`Mark ${item.text} ${item.completed ? 'incomplete' : 'complete'}`}
                            checked={item.completed}
                            disabled={!canEditCard || checklistPending}
                            onChange={() => toggleChecklistItem(checklist.id, item.id)}
                            className="h-5 w-5 shrink-0 rounded disabled:cursor-default"
                          />
                          <span className="min-w-0 flex-1 text-sm" style={{ color: 'var(--text-primary)', opacity: item.completed ? 0.55 : 1, textDecoration: item.completed ? 'line-through' : 'none' }}>{item.text}</span>
                          {canEditCard && (
                            <button
                              type="button"
                              aria-label={`Delete checklist item ${item.text}`}
                              disabled={checklistPending}
                              onClick={() => deleteChecklistItem(checklist.id, item.id)}
                              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md disabled:opacity-50"
                              style={{ color: '#ef4444' }}
                            ><Trash2 size={16} /></button>
                          )}
                        </div>
                      ))}
                    </div>

                    {addingItemTo === checklist.id && canEditCard ? (
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input
                          autoFocus
                          value={newItemText}
                          disabled={checklistPending}
                          onChange={event => setNewItemText(event.target.value)}
                          onKeyDown={event => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              addChecklistItem(checklist.id);
                            }
                            if (event.key === 'Escape') {
                              setAddingItemTo(null);
                              setNewItemText('');
                            }
                          }}
                          placeholder="Checklist item"
                          className="min-h-[44px] flex-1 rounded-md border px-3 text-sm outline-none disabled:opacity-50"
                          style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        />
                        <button type="button" disabled={checklistPending || !newItemText.trim()} onClick={() => addChecklistItem(checklist.id)} className="min-h-[44px] rounded-md px-4 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>Save checklist item</button>
                        <button type="button" disabled={checklistPending} onClick={() => { setAddingItemTo(null); setNewItemText(''); }} className="min-h-[44px] px-3 text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
                      </div>
                    ) : canEditCard ? (
                      <button
                        type="button"
                        aria-label={`Add item to ${checklist.title}`}
                        disabled={checklistPending}
                        onClick={() => {
                          setChecklistError('');
                          setNewItemText('');
                          setAddingItemTo(checklist.id);
                        }}
                        className="mt-2 min-h-[44px] rounded-md px-3 text-sm font-semibold disabled:opacity-50"
                        style={{ color: 'var(--accent)' }}
                      >Add item</button>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          )}

          {(card.attachments.length > 0 || revealedSections.attachments) && (
            <section className="mb-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <SectionHeading icon={Paperclip} title="Attachments" className="mb-0" />
                {canEditCard && <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={event => {
                    void handleFileAttachment(event.target.files);
                  }}
                />}
                {canEditCard && <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] text-sm font-medium"
                  style={{ color: 'var(--accent)' }}
                >
                  Upload files
                </button>}
              </div>
              {canEditCard && <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={attachmentLink}
                  onChange={event => setAttachmentLink(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleLinkAttachment();
                    }
                  }}
                  placeholder="Paste link or cloud doc URL"
                  className="min-h-[44px] flex-1 rounded-md border px-3 text-sm outline-none"
                  style={{ background: 'transparent', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                <button
                  type="button"
                  onClick={handleLinkAttachment}
                  className="min-h-[44px] rounded-md px-4 text-sm font-medium text-white"
                  style={{ background: 'var(--accent)' }}
                >
                  Attach
                </button>
              </div>}
              <div className="space-y-2">
                {card.attachments.length === 0 && (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Add files or links to keep task context close to the work.
                  </p>
                )}
                {card.attachments.map(attachment => (
                  <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.04)' }}>
                    <div className="min-w-0 flex-1">
                      {attachment.kind === 'link' && attachment.url ? (
                        <a href={attachment.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {attachment.name}
                        </a>
                      ) : (
                        <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{attachment.name}</p>
                      )}
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {attachment.kind === 'link' ? 'Link attachment' : `${attachment.mimeType || 'File'}${attachment.size ? ` • ${Math.max(1, Math.round(attachment.size / 1024))} KB` : ''}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasFilePayload(attachment) && (
                        <a
                          href={attachment.url}
                          download={attachment.name}
                          aria-label={`Download ${attachment.name}`}
                          className="flex h-10 w-10 items-center justify-center rounded-full transition-opacity hover:opacity-80"
                          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
                        >
                          <Download size={16} />
                        </a>
                      )}
                      {canViewFileAttachment(attachment) && (
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`View ${attachment.name}`}
                          className="flex h-10 w-10 items-center justify-center rounded-full transition-opacity hover:opacity-80"
                          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
                        >
                          <Eye size={16} />
                        </a>
                      )}
                      {canEditCard && <button
                        type="button"
                        aria-label={`Remove ${attachment.name}`}
                        onClick={async () => {
                          dispatch({ type: 'REMOVE_ATTACHMENT', payload: { cardId: card.id, attachmentId: attachment.id } });
                          try {
                            await updateCardApi(card.id, { attachments: card.attachments.filter(item => item.id !== attachment.id) });
                          } catch (error) {
                            await restoreFromServer(
                              'Attachment removal failed',
                              error instanceof Error ? error.message : 'The attachment could not be removed.',
                            );
                          }
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-full"
                        style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}
                      >
                        <Trash2 size={16} />
                      </button>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionHeading icon={MessageSquare} title="Comments and activity" />
            {canCollaborate && <div className="mb-4 flex gap-3">
              <AvatarBadge initials={currentUser?.initials ?? '??'} color={currentUser?.color ?? '#6366f1'} />
              <div className="flex-1">
                <textarea
                  value={comment}
                  onChange={event => setComment(event.target.value)}
                  disabled={commentPending}
                  placeholder="Write a comment..."
                  rows={2}
                  className="w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                {comment.trim() && (
                  <button
                    type="button"
                    disabled={commentPending}
                    onClick={() => void handleCreateComment()}
                    className="mt-2 min-h-[44px] rounded-md px-4 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-60"
                    style={{ background: 'var(--accent)' }}
                  >
                    {commentPending ? 'Sending…' : 'Send'}
                  </button>
                )}
              </div>
            </div>}

            {commentError && <p role="alert" className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">{commentError}</p>}

            <div className="space-y-4">
              {card.comments.slice().reverse().map(entry => {
                const user = getUserDisplay(state, entry.userId);
                return (
                  <div key={entry.id} className="flex gap-3">
                    <AvatarBadge initials={user.initials} color={user.color} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{user.name}</span>
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(entry.createdAt).toLocaleString()}</span>
                      </div>
                      {editingCommentId === entry.id ? (
                        <div className="mt-2">
                          <textarea
                            autoFocus
                            aria-label="Edit comment"
                            value={editingCommentText}
                            disabled={commentPending}
                            onChange={event => setEditingCommentText(event.target.value)}
                            rows={2}
                            className="w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none disabled:opacity-60"
                            style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                          />
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button type="button" aria-label="Save comment" disabled={commentPending || !editingCommentText.trim()} onClick={() => void saveCommentEdit()} className="min-h-[44px] rounded-md px-3 text-sm font-semibold text-white disabled:opacity-60" style={{ background: 'var(--accent)' }}>Save</button>
                            <button type="button" aria-label="Cancel comment editing" disabled={commentPending} onClick={cancelCommentEdit} className="min-h-[44px] px-3 text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>{entry.text}</p>
                          <div className="mt-1 flex flex-wrap gap-3">
                            {canCollaborate && entry.userId === state.currentUserId && (
                              <button type="button" aria-label={`Edit comment ${entry.text}`} disabled={commentPending || Boolean(deletingCommentId)} onClick={() => beginCommentEdit(entry.id, entry.text)} className="min-h-[40px] text-xs font-semibold disabled:opacity-50" style={{ color: 'var(--accent)' }}>Edit</button>
                            )}
                            {canDeleteCard && canCollaborate && (
                              <button type="button" aria-label={`Delete comment ${entry.text}`} disabled={commentPending || Boolean(deletingCommentId)} onClick={() => void handleDeleteComment(entry.id)} className="min-h-[40px] text-xs font-semibold disabled:opacity-50" style={{ color: '#ef4444' }}>{deletingCommentId === entry.id ? 'Deleting…' : 'Delete'}</button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {card.activity.length > 0 && (
                <div className="border-t pt-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>Activity</p>
                  <div className="space-y-3">
                    {card.activity.slice().reverse().map(entry => {
                      const user = getUserDisplay(state, entry.userId);
                      return (
                        <div key={entry.id} className="flex items-start gap-3">
                          <AvatarBadge initials={user.initials} color={user.color} compact />
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{user.name}</strong> {entry.action}
                            <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(entry.createdAt).toLocaleString()}</span>
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  className = 'mb-2',
}: {
  icon: typeof AlignLeft;
  title: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Icon size={16} style={{ color: 'var(--text-secondary)' }} />
      <h3 className="text-[1.05rem] font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
    </div>
  );
}

function AvatarBadge({ initials, color, compact = false }: { initials: string; color: string; compact?: boolean }) {
  const size = compact ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-[11px]';
  return (
    <div className={`flex ${size} shrink-0 items-center justify-center rounded-full font-bold text-white`} style={{ background: color }}>
      {initials}
    </div>
  );
}
