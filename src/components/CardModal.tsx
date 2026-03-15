import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AlignLeft, Clock3, Download, Eye, EyeOff, MessageSquare, Paperclip, Plus, Tag, Trash2, Users, X } from 'lucide-react';
import { uid } from '../data';
import { deleteCardApi, updateCardApi, moveCardApi } from '../services/data';
import { useAppState, useDispatch } from '../store';
import { useAuth } from '../lib/auth-context';
import type { Attachment } from '../types';
import { toast } from '../hooks/use-toast';

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
  const [desc, setDesc] = useState('');
  const [comment, setComment] = useState('');
  const [attachmentLink, setAttachmentLink] = useState('');
  const [titleEditing, setTitleEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [labelQuery, setLabelQuery] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
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
  const availableMembers = state.users.filter(user => !card.memberIds.includes(user.id));
  const lists = state.lists
    .filter(candidate => candidate.boardId === card.boardId && !candidate.archived)
    .sort((a, b) => a.position - b.position);
  const currentUser = state.users.find(user => user.id === state.currentUserId) ?? state.users[0] ?? null;
  const canEditCard = auth.canEditBoardCards(card.boardId);
  const canDeleteCard = auth.canManageBoard(card.boardId);
  const hiddenSectionButtons = [
    { key: 'members' as const, label: 'Members', icon: Users, visible: card.memberIds.length > 0 || revealedSections.members },
    { key: 'dueDate' as const, label: 'Dates', icon: Clock3, visible: Boolean(card.dueDate) || revealedSections.dueDate },
    { key: 'attachments' as const, label: 'Attachment', icon: Paperclip, visible: card.attachments.length > 0 || revealedSections.attachments },
  ].filter(section => !section.visible);

  const close = () => dispatch({ type: 'SET_ACTIVE_CARD', payload: null });
  const closeLabelPicker = () => {
    setLabelPickerOpen(false);
    setLabelQuery('');
  };

  const persistCard = (updates: Record<string, unknown>) => {
    dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, ...updates } });
    updateCardApi(card.id, updates);
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

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setDeleteConfirmation('');
    setDeletePending(false);
  };

  const handleDeleteCard = async () => {
    if (!canDeleteCard || deletePending || deleteConfirmation !== 'DELETE') return;

    setDeletePending(true);

    try {
      await deleteCardApi(card.id);
      dispatch({ type: 'DELETE_CARD', payload: card.id });
      closeDeleteDialog();
    } catch (error) {
      setDeletePending(false);
      toast({
        title: 'Card not deleted',
        description: error instanceof Error ? error.message : 'The card could not be deleted.',
        variant: 'destructive',
      });
    }
  };

  const handleMoveList = (nextListId: string) => {
    if (!nextListId || nextListId === card.listId) return;
    dispatch({ type: 'MOVE_CARD', payload: { cardId: card.id, toListId: nextListId, toPosition: 0 } });
    moveCardApi(card.id, nextListId, 0);
  };

  const handleToggleWatch = () => {
    persistCard({ watching: !card.watching });
  };

  const beginTitleEdit = () => {
    setDraftTitle(card.title);
    setTitleEditing(true);
  };

  const commitTitle = () => {
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
    revealSection('members');
    persistCard({ memberIds: nextMemberIds, watching: getWatchingForMemberChange(nextMemberIds) });
  };

  const handleLinkAttachment = async () => {
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
    if (!files) return;

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
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5" style={{ borderColor: 'var(--border)' }}>
          <select
            aria-label="Card list"
            value={card.listId}
            onChange={event => handleMoveList(event.target.value)}
            className="min-h-[40px] rounded-md border px-3 text-sm font-medium outline-none"
            style={{ background: '#2a2d36', borderColor: 'transparent', color: 'var(--text-primary)' }}
          >
            {lists.map(candidate => (
              <option key={candidate.id} value={candidate.id}>{candidate.title}</option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            {canDeleteCard && (
              <button
                aria-label="Delete card"
                onClick={() => {
                  setDeleteDialogOpen(true);
                  setDeleteConfirmation('');
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full transition-opacity hover:opacity-80"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
              >
                <Trash2 size={18} />
              </button>
            )}
            <button
              aria-label={card.watching ? 'Stop watching card' : 'Watch card'}
              onClick={handleToggleWatch}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-opacity hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.06)', color: card.watching ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            >
              {card.watching ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
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
          <div className="mb-5 min-w-0">
            {titleEditing ? (
              <input
                ref={titleInputRef}
                value={draftTitle}
                onChange={event => setDraftTitle(event.target.value)}
                onBlur={commitTitle}
                onKeyDown={handleTitleKeyDown}
                className="w-full border-none bg-transparent text-[2rem] font-bold leading-tight outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
            ) : (
              <button
                type="button"
                onClick={beginTitleEdit}
                className="w-full text-left text-[2rem] font-bold leading-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {card.title}
              </button>
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
              <button
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
              </button>
          </div>

          {labelPickerOpen && (
            <div
              className="absolute right-4 top-32 z-20 w-[min(22rem,calc(100%-2rem))] rounded-2xl border p-3 shadow-2xl"
              style={{ background: 'var(--dropdown-bg)', borderColor: 'var(--border)' }}
              onClick={event => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <input
                  value={labelQuery}
                  onChange={event => setLabelQuery(event.target.value)}
                  placeholder="Search labels"
                  className="min-h-[44px] w-full rounded-md border px-3 text-sm outline-none"
                  style={{ background: 'transparent', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
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
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {visiblePickerLabels.map(label => {
                  const active = card.labelIds.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      disabled={!canEditCard || active}
                      onClick={() => {
                        revealSection('labels');
                        persistCard({ labelIds: [...card.labelIds, label.id] });
                      }}
                      className="flex min-h-[44px] items-center justify-between rounded-md px-3 text-sm font-medium text-white disabled:cursor-default disabled:opacity-60"
                      style={{ background: label.color }}
                    >
                      <span>{label.name}</span>
                      <span>{active ? 'Added' : 'Add'}</span>
                    </button>
                  );
                })}
                {visiblePickerLabels.length === 0 && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No labels match your search.</p>}
              </div>
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
                    disabled={!canEditCard}
                    onClick={() => handleMemberChange(card.memberIds.filter(id => id !== member.id))}
                    className="inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-default disabled:opacity-100"
                    style={{ background: member.color }}
                    title={canEditCard ? `Remove ${member.name}` : member.name}
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-[11px] font-bold">{member.initials}</span>
                  </button>
                ))}
                {canEditCard && availableMembers.length > 0 && (
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
                  value={card.dueDate ? card.dueDate.split('T')[0] : ''}
                  onChange={event => {
                    const dueDate = event.target.value ? new Date(event.target.value).toISOString() : null;
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
                      onChange={() => persistCard({ dueDateComplete: !card.dueDateComplete })}
                      className="rounded"
                    />
                    Complete
                  </label>
                )}
              </div>
            </section>
          )}

          <section className="mb-5">
            <SectionHeading icon={AlignLeft} title="Description" />
            {descEditing ? (
              <div>
                <textarea
                  autoFocus
                  value={desc}
                  onChange={event => setDesc(event.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none"
                  style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      persistCard({ description: desc });
                      setDescEditing(false);
                    }}
                    className="min-h-[44px] rounded-md px-4 text-sm font-medium text-white"
                    style={{ background: 'var(--accent)' }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDesc(card.description);
                      setDescEditing(false);
                    }}
                    className="min-h-[44px] px-2 text-sm"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDesc(card.description);
                  setDescEditing(true);
                }}
                className="min-h-[88px] w-full rounded-xl border px-4 py-3 text-left text-sm"
                style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)', color: card.description ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              >
                {card.description || 'Add a more detailed description...'}
              </button>
            )}
          </section>

          {(card.attachments.length > 0 || revealedSections.attachments) && (
            <section className="mb-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <SectionHeading icon={Paperclip} title="Attachments" className="mb-0" />
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={event => {
                    void handleFileAttachment(event.target.files);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] text-sm font-medium"
                  style={{ color: 'var(--accent)' }}
                >
                  Upload files
                </button>
              </div>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row">
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
              </div>
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
                      <button
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
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionHeading icon={MessageSquare} title="Comments and activity" />
            <div className="mb-4 flex gap-3">
              <AvatarBadge initials={currentUser?.initials ?? '??'} color={currentUser?.color ?? '#6366f1'} />
              <div className="flex-1">
                <textarea
                  value={comment}
                  onChange={event => setComment(event.target.value)}
                  placeholder="Write a comment..."
                  rows={2}
                  className="w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                {comment.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      const newComment = { id: uid(), userId: state.currentUserId, text: comment.trim(), createdAt: new Date().toISOString() };
                      dispatch({ type: 'ADD_COMMENT', payload: { cardId: card.id, text: comment.trim() } });
                      updateCardApi(card.id, { comments: [...card.comments, newComment] });
                      setComment('');
                    }}
                    className="mt-2 min-h-[44px] rounded-md px-4 text-sm font-medium text-white"
                    style={{ background: 'var(--accent)' }}
                  >
                    Send
                  </button>
                )}
              </div>
            </div>

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
                      <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>{entry.text}</p>
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
        {deleteDialogOpen && (
          <div className="absolute inset-0 z-30 flex items-center justify-center px-4" style={{ background: 'rgba(5, 7, 12, 0.78)' }}>
            <div className="w-full max-w-md rounded-2xl border p-5" style={{ background: 'var(--modal-bg)', borderColor: 'var(--border)' }}>
              <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Delete card</h3>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Card <strong style={{ color: 'var(--text-primary)' }}>{card.title}</strong> will be permanently deleted. Type <strong style={{ color: 'var(--text-primary)' }}>DELETE</strong> to enable confirmation.
              </p>
              <input
                autoFocus
                value={deleteConfirmation}
                onChange={event => setDeleteConfirmation(event.target.value)}
                placeholder="Type DELETE to confirm"
                className="mt-4 w-full rounded-lg border px-3 min-h-[44px] text-sm outline-none"
                style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeDeleteDialog}
                  className="rounded-xl px-4 min-h-[44px] text-sm font-semibold"
                  style={{ background: '#2563eb', color: '#eff6ff' }}
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={() => { void handleDeleteCard(); }}
                  disabled={deleteConfirmation !== 'DELETE' || deletePending}
                  className="rounded-xl px-4 min-h-[44px] text-sm font-semibold"
                  style={{ background: deleteConfirmation === 'DELETE' ? '#dc2626' : '#7f1d1d', color: '#fff5f5', opacity: deletePending ? 0.75 : 1 }}
                >
                  YES
                </button>
              </div>
            </div>
          </div>
        )}
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
