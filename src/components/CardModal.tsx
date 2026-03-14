import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AlignLeft, Circle, Clock3, Eye, EyeOff, MessageSquare, Paperclip, Plus, Tag, Users, X } from 'lucide-react';
import { uid } from '../data';
import { updateCardApi, moveCardApi } from '../services/data';
import { useAppState, useDispatch } from '../store';
import { useAuth } from '../lib/auth-context';

type OptionalSectionKey = 'members' | 'labels' | 'dueDate' | 'attachments';

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

  const handleLinkAttachment = () => {
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
    updateCardApi(card.id, { attachments: [...card.attachments, attachment] });
    setAttachmentLink('');
    revealSection('attachments');
  };

  const handleFileAttachment = (files: FileList | null) => {
    if (!files) return;

    const newAttachments = Array.from(files).map(file => ({
      id: uid(),
      name: file.name,
      kind: 'file' as const,
      size: file.size,
      mimeType: file.type,
      createdAt: new Date().toISOString(),
    }));

    newAttachments.forEach(attachment => {
      dispatch({
        type: 'ADD_ATTACHMENT',
        payload: { cardId: card.id, attachment },
      });
    });
    updateCardApi(card.id, { attachments: [...card.attachments, ...newAttachments] });
    if (fileInputRef.current) fileInputRef.current.value = '';
    revealSection('attachments');
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
          <div className="mb-5 flex items-start gap-3">
            <div className="pt-1" style={{ color: 'var(--text-muted)' }}>
              <Circle size={18} />
            </div>
            <div className="min-w-0 flex-1">
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
                  onChange={event => handleFileAttachment(event.target.files)}
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
                      {attachment.url ? (
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
                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: 'REMOVE_ATTACHMENT', payload: { cardId: card.id, attachmentId: attachment.id } });
                        updateCardApi(card.id, { attachments: card.attachments.filter(item => item.id !== attachment.id) });
                      }}
                      className="min-h-[44px] text-sm"
                      style={{ color: '#ef4444' }}
                    >
                      Remove
                    </button>
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
                const user = state.users.find(candidate => candidate.id === entry.userId);
                return (
                  <div key={entry.id} className="flex gap-3">
                    <AvatarBadge initials={user?.initials ?? '??'} color={user?.color ?? '#888'} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{user?.name}</span>
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
                      const user = state.users.find(candidate => candidate.id === entry.userId);
                      return (
                        <div key={entry.id} className="flex items-start gap-3">
                          <AvatarBadge initials={user?.initials ?? '??'} color={user?.color ?? '#888'} compact />
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{user?.name}</strong> {entry.action}
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
