import { useRef, useState } from 'react';
import { useAppState, useDispatch } from '../store';
import { uid } from '../data';
import { updateCardApi, moveCardApi } from '../services/data';

export function CardModal() {
  const state = useAppState();
  const dispatch = useDispatch();
  const card = state.cards.find(c => c.id === state.activeCardId);
  const [descEditing, setDescEditing] = useState(false);
  const [desc, setDesc] = useState('');
  const [comment, setComment] = useState('');
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState('');
  const [attachmentLink, setAttachmentLink] = useState('');
  const [tab, setTab] = useState<'details' | 'activity'>('details');
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!card) return null;

  const board = state.boards.find(b => b.id === card.boardId);
  const list = state.lists.find(l => l.id === card.listId);
  const labels = board?.labels || [];
  const members = state.users.filter(u => card.memberIds.includes(u.id));
  const availableMembers = state.users.filter(u => !card.memberIds.includes(u.id));
  const lists = state.lists.filter(l => l.boardId === card.boardId && !l.archived).sort((a, b) => a.position - b.position);
  const totalItems = card.checklists.reduce((a, c) => a + c.items.length, 0);
  const checkedItems = card.checklists.reduce((a, c) => a + c.items.filter(i => i.completed).length, 0);
  const progress = totalItems > 0 ? (checkedItems / totalItems) * 100 : 0;

  const close = () => dispatch({ type: 'SET_ACTIVE_CARD', payload: null });

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
  };

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) close(); }}
      className="fixed inset-0 z-50 flex items-start justify-center pt-12 pb-12 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden" style={{ background: 'var(--modal-bg)' }}>
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3">
          <div className="flex-1 pr-4">
            <input
              value={card.title}
              onChange={e => { dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, title: e.target.value } }); updateCardApi(card.id, { title: e.target.value }); }}
              className="text-lg font-bold bg-transparent outline-none w-full"
              style={{ color: 'var(--text-primary)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              in list <strong style={{ color: 'var(--text-secondary)' }}>{list?.title}</strong>
              {card.watching && <span className="ml-2">👁 Watching</span>}
            </p>
          </div>
          <button aria-label="Close card" onClick={close} className="text-base shrink-0 w-9 h-9 rounded-lg flex items-center justify-center hover:opacity-70 transition-opacity" style={{ color: 'var(--text-muted)', background: 'var(--active-bg)' }}>✕</button>
        </div>

        <div className="flex gap-5 px-5 pb-5">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Labels */}
            <div className="mb-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Labels</h4>
              <div className="flex flex-wrap gap-1.5">
                {labels.map(l => (
                  <button
                    key={l.id}
                    onClick={() => {
                      const ids = card.labelIds.includes(l.id) ? card.labelIds.filter(x => x !== l.id) : [...card.labelIds, l.id];
                      dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, labelIds: ids } });
                      updateCardApi(card.id, { labelIds: ids });
                    }}
                    className="px-2.5 min-h-[44px] flex items-center rounded text-[10px] font-bold text-white transition-all"
                    style={{ background: l.color, opacity: card.labelIds.includes(l.id) ? 1 : 0.3, outline: card.labelIds.includes(l.id) ? `2px solid ${l.color}` : 'none', outlineOffset: '1px' }}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Members */}
            <div className="mb-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Members</h4>
              <div className="flex flex-wrap gap-1.5 items-center">
                {members.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { const ids = card.memberIds.filter(x => x !== m.id); dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, memberIds: ids } }); updateCardApi(card.id, { memberIds: ids }); }}
                    className="flex items-center gap-1.5 px-3 min-h-[44px] rounded-full text-xs font-medium text-white transition-opacity hover:opacity-80"
                    style={{ background: m.color }}
                    title={`Remove ${m.name}`}
                  >
                    {m.initials} {m.name}
                  </button>
                ))}
                {availableMembers.length > 0 && (
                  <select
                    value=""
                    onChange={e => {
                      if (e.target.value) { const ids = [...card.memberIds, e.target.value]; dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, memberIds: ids } }); updateCardApi(card.id, { memberIds: ids }); }
                    }}
                    className="text-xs px-3 min-h-[44px] rounded border bg-transparent cursor-pointer"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  >
                    <option value="">+ Add…</option>
                    {availableMembers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                )}
              </div>
            </div>

            {/* Due date */}
            <div className="mb-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Due Date</h4>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={card.dueDate ? card.dueDate.split('T')[0] : ''}
                  onChange={e => { const dueDate = e.target.value ? new Date(e.target.value).toISOString() : null; dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, dueDate } }); updateCardApi(card.id, { dueDate }); }}
                  className="text-xs px-3 min-h-[44px] rounded border bg-transparent"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                {card.dueDate && (
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer min-h-[44px]" style={{ color: 'var(--text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={card.dueDateComplete}
                      onChange={() => { dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, dueDateComplete: !card.dueDateComplete } }); updateCardApi(card.id, { dueDateComplete: !card.dueDateComplete }); }}
                      className="rounded"
                    />
                    Complete
                  </label>
                )}
              </div>
            </div>

            {/* Move to list */}
            <div className="mb-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Move to</h4>
              <select
                value={card.listId}
                onChange={e => { dispatch({ type: 'MOVE_CARD', payload: { cardId: card.id, toListId: e.target.value, toPosition: 0 } }); moveCardApi(card.id, e.target.value, 0); }}
                className="text-xs px-3 min-h-[44px] rounded border bg-transparent cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                {lists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            </div>

            {/* Description */}
            <div className="mb-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Description</h4>
              {descEditing ? (
                <div>
                  <textarea
                    autoFocus
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none border"
                    style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  <div className="flex gap-1 mt-1">
                    <button onClick={() => { dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, description: desc } }); updateCardApi(card.id, { description: desc }); setDescEditing(false); }} className="px-3 min-h-[44px] rounded text-xs font-medium text-white" style={{ background: 'var(--accent)' }}>Save</button>
                    <button onClick={() => { setDesc(card.description); setDescEditing(false); }} className="px-3 min-h-[44px] text-xs" style={{ color: 'var(--text-muted)' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => { setDesc(card.description); setDescEditing(true); }}
                  className="px-3 py-2 rounded-lg text-sm cursor-pointer min-h-[40px]"
                  style={{ background: 'var(--input-bg)', color: card.description ? 'var(--text-primary)' : 'var(--text-muted)' }}
                >
                  {card.description || 'Add a description…'}
                </div>
              )}
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <h4 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Attachments</h4>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => handleFileAttachment(e.target.files)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] font-medium"
                  style={{ color: 'var(--accent)' }}
                >
                  + Upload files
                </button>
              </div>
              <div className="flex gap-2 mb-2">
                <input
                  value={attachmentLink}
                  onChange={e => setAttachmentLink(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleLinkAttachment();
                    }
                  }}
                  placeholder="Paste link or cloud doc URL"
                  className="flex-1 px-3 min-h-[44px] text-xs rounded border bg-transparent outline-none"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                <button onClick={handleLinkAttachment} className="px-3 min-h-[44px] rounded text-xs font-medium text-white" style={{ background: 'var(--accent)' }}>Attach</button>
              </div>
              <div className="space-y-1.5">
                {card.attachments.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Add files or links to keep task context close to the work.</p>}
                {card.attachments.map(attachment => (
                  <div key={attachment.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--input-bg)' }}>
                    <div className="min-w-0">
                      {attachment.url ? (
                        <a href={attachment.url} target="_blank" rel="noreferrer" className="text-xs font-medium block truncate" style={{ color: 'var(--text-primary)' }}>
                          {attachment.name}
                        </a>
                      ) : (
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{attachment.name}</p>
                      )}
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {attachment.kind === 'link' ? 'Link attachment' : `${attachment.mimeType || 'File'}${attachment.size ? ` • ${Math.max(1, Math.round(attachment.size / 1024))} KB` : ''}`}
                      </p>
                    </div>
                    <button
                      onClick={() => { dispatch({ type: 'REMOVE_ATTACHMENT', payload: { cardId: card.id, attachmentId: attachment.id } }); updateCardApi(card.id, { attachments: card.attachments.filter(item => item.id !== attachment.id) }); }}
                      className="text-xs min-h-[44px] flex items-center"
                      style={{ color: '#ef4444' }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Checklists */}
            {card.checklists.length > 0 && (
              <div className="mb-4">
                {totalItems > 0 && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold" style={{ color: progress === 100 ? '#22c55e' : 'var(--text-muted)' }}>{Math.round(progress)}%</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: progress === 100 ? '#22c55e' : 'var(--accent)' }} />
                    </div>
                  </div>
                )}
                {card.checklists.map(cl => (
                  <div key={cl.id} className="mb-3">
                    <h4 className="text-xs font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>☑ {cl.title}</h4>
                    {cl.items.map(item => (
                      <div key={item.id} className="flex items-center gap-2 min-h-[44px] group">
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => { dispatch({ type: 'TOGGLE_CHECKLIST_ITEM', payload: { cardId: card.id, checklistId: cl.id, itemId: item.id } }); const updated = card.checklists.map(c => c.id === cl.id ? { ...c, items: c.items.map(i => i.id === item.id ? { ...i, completed: !i.completed } : i) } : c); updateCardApi(card.id, { checklists: updated }); }}
                          className="rounded shrink-0"
                        />
                        <span className="text-sm flex-1" style={{ color: 'var(--text-primary)', textDecoration: item.completed ? 'line-through' : 'none', opacity: item.completed ? 0.5 : 1 }}>{item.text}</span>
                        <button
                          onClick={() => { dispatch({ type: 'DELETE_CHECKLIST_ITEM', payload: { cardId: card.id, checklistId: cl.id, itemId: item.id } }); const updated = card.checklists.map(c => c.id === cl.id ? { ...c, items: c.items.filter(i => i.id !== item.id) } : c); updateCardApi(card.id, { checklists: updated }); }}
                          className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded flex items-center justify-center text-xs transition-opacity"
                          style={{ color: '#ef4444' }}
                        >✕</button>
                      </div>
                    ))}
                    {addingItemTo === cl.id ? (
                      <div className="flex gap-1 mt-1">
                        <input
                          autoFocus
                          value={newItemText}
                          onChange={e => setNewItemText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && newItemText.trim()) {
                              dispatch({ type: 'ADD_CHECKLIST_ITEM', payload: { cardId: card.id, checklistId: cl.id, text: newItemText.trim() } });
                              const newItem = { id: crypto.randomUUID(), text: newItemText.trim(), completed: false };
                              const updated = card.checklists.map(c => c.id === cl.id ? { ...c, items: [...c.items, newItem] } : c);
                              updateCardApi(card.id, { checklists: updated });
                              setNewItemText('');
                            }
                            if (e.key === 'Escape') { setAddingItemTo(null); setNewItemText(''); }
                          }}
                          placeholder="Item text…"
                          className="flex-1 px-2 py-1 text-xs rounded border bg-transparent outline-none"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        />
                        <button onClick={() => {
                          if (newItemText.trim()) { dispatch({ type: 'ADD_CHECKLIST_ITEM', payload: { cardId: card.id, checklistId: cl.id, text: newItemText.trim() } }); const newItem = { id: crypto.randomUUID(), text: newItemText.trim(), completed: false }; const updated = card.checklists.map(c => c.id === cl.id ? { ...c, items: [...c.items, newItem] } : c); updateCardApi(card.id, { checklists: updated }); }
                          setNewItemText('');
                        }} className="text-xs px-3 min-h-[44px] rounded text-white" style={{ background: 'var(--accent)' }}>Add</button>
                        <button onClick={() => { setAddingItemTo(null); setNewItemText(''); }} className="text-xs px-2 min-h-[44px]" style={{ color: 'var(--text-muted)' }}>✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setAddingItemTo(cl.id)} className="text-xs min-h-[44px] flex items-center" style={{ color: 'var(--text-muted)' }}>+ Add item</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add checklist */}
            {addingChecklist ? (
              <div className="mb-4">
                <div className="flex gap-1">
                  <input
                    autoFocus
                    value={newChecklistTitle}
                    onChange={e => setNewChecklistTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newChecklistTitle.trim()) {
                        dispatch({ type: 'ADD_CHECKLIST', payload: { cardId: card.id, title: newChecklistTitle.trim() } });
                        const newCl = { id: crypto.randomUUID(), title: newChecklistTitle.trim(), items: [] };
                        updateCardApi(card.id, { checklists: [...card.checklists, newCl] });
                        setNewChecklistTitle('');
                        setAddingChecklist(false);
                      }
                      if (e.key === 'Escape') { setAddingChecklist(false); setNewChecklistTitle(''); }
                    }}
                    placeholder="Checklist title…"
                    className="flex-1 px-2 py-1 text-xs rounded border bg-transparent outline-none"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  <button onClick={() => {
                    if (newChecklistTitle.trim()) { dispatch({ type: 'ADD_CHECKLIST', payload: { cardId: card.id, title: newChecklistTitle.trim() } }); const newCl = { id: crypto.randomUUID(), title: newChecklistTitle.trim(), items: [] }; updateCardApi(card.id, { checklists: [...card.checklists, newCl] }); }
                    setNewChecklistTitle(''); setAddingChecklist(false);
                  }} className="text-xs px-3 min-h-[44px] rounded text-white" style={{ background: 'var(--accent)' }}>Add</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingChecklist(true)} className="text-xs min-h-[44px] flex items-center mb-4" style={{ color: 'var(--accent)' }}>+ Add checklist</button>
            )}

            {/* Tabs: Comments / Activity */}
            <div className="flex gap-3 border-b mb-3" style={{ borderColor: 'var(--border)' }}>
              {(['details', 'activity'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="text-xs font-medium min-h-[44px] flex items-center capitalize transition-colors"
                  style={{ color: tab === t ? 'var(--accent)' : 'var(--text-muted)', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent' }}
                >
                  {t === 'details' ? `Comments (${card.comments.length})` : 'Activity'}
                </button>
              ))}
            </div>

            {tab === 'details' && (
              <>
                {/* Comment input */}
                <div className="flex gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold text-white" style={{ background: '#6366f1' }}>YO</div>
                  <div className="flex-1">
                    <textarea
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Write a comment… (use @name to mention)"
                      rows={2}
                      className="w-full px-2 py-1.5 rounded-lg text-xs outline-none resize-none border"
                      style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    />
                    {comment.trim() && (
                      <button
                        onClick={() => { const newComment = { id: crypto.randomUUID(), userId: state.users[0]?.id || '', text: comment.trim(), createdAt: new Date().toISOString() }; dispatch({ type: 'ADD_COMMENT', payload: { cardId: card.id, text: comment.trim() } }); updateCardApi(card.id, { comments: [...card.comments, newComment] }); setComment(''); }}
                        className="mt-1 px-3 min-h-[44px] rounded text-xs font-medium text-white"
                        style={{ background: 'var(--accent)' }}
                      >
                        Send
                      </button>
                    )}
                  </div>
                </div>
                {/* Comments */}
                {card.comments.slice().reverse().map(cm => {
                  const user = state.users.find(u => u.id === cm.userId);
                  return (
                    <div key={cm.id} className="flex gap-2 mb-3">
                      <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold text-white" style={{ background: user?.color || '#888' }}>{user?.initials}</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{user?.name}</span>
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{new Date(cm.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{cm.text}</p>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {tab === 'activity' && (
              <div className="space-y-2">
                {card.activity.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No activity yet</p>}
                {card.activity.slice().reverse().map(a => {
                  const user = state.users.find(u => u.id === a.userId);
                  return (
                    <div key={a.id} className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[8px] font-bold text-white" style={{ background: user?.color || '#888' }}>{user?.initials}</div>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>{user?.name}</strong> {a.action}
                        <span className="ml-1" style={{ color: 'var(--text-muted)' }}>{new Date(a.createdAt).toLocaleString()}</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar actions */}
          <div className="w-36 shrink-0 space-y-1.5">
            <h4 className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Actions</h4>
            <button
              aria-label={card.watching ? 'Stop watching card' : 'Watch card'}
              onClick={() => { dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, watching: !card.watching } }); updateCardApi(card.id, { watching: !card.watching }); }}
              className="w-full text-left px-2.5 min-h-[44px] flex items-center rounded text-xs transition-colors"
              style={{ background: 'var(--active-bg)', color: 'var(--text-secondary)' }}
            >
              {card.watching ? '👁 Watching' : '👁 Watch'}
            </button>
            <button
              aria-label="Archive card"
              onClick={() => { dispatch({ type: 'ARCHIVE_CARD', payload: card.id }); updateCardApi(card.id, { archived: true }); }}
              className="w-full text-left px-2.5 min-h-[44px] flex items-center rounded text-xs transition-colors"
              style={{ background: 'var(--active-bg)', color: '#ef4444' }}
            >
              📦 Archive
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
