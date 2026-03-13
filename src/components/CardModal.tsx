import React, { useState, useEffect, useRef } from 'react';
import { useAppState, useDispatch } from '../store';

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
  const [tab, setTab] = useState<'details' | 'activity'>('details');
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (card) { setDesc(card.description); setDescEditing(false); }
  }, [card?.id]);

  if (!card) return null;

  const board = state.boards.find(b => b.id === card.boardId);
  const list = state.lists.find(l => l.id === card.listId);
  const labels = board?.labels || [];
  const cardLabels = labels.filter(l => card.labelIds.includes(l.id));
  const members = state.users.filter(u => card.memberIds.includes(u.id));
  const availableMembers = state.users.filter(u => !card.memberIds.includes(u.id));
  const lists = state.lists.filter(l => l.boardId === card.boardId && !l.archived).sort((a, b) => a.position - b.position);
  const totalItems = card.checklists.reduce((a, c) => a + c.items.length, 0);
  const checkedItems = card.checklists.reduce((a, c) => a + c.items.filter(i => i.completed).length, 0);
  const progress = totalItems > 0 ? (checkedItems / totalItems) * 100 : 0;

  const close = () => dispatch({ type: 'SET_ACTIVE_CARD', payload: null });

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
              onChange={e => dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, title: e.target.value } })}
              className="text-lg font-bold bg-transparent outline-none w-full"
              style={{ color: 'var(--text-primary)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              in list <strong style={{ color: 'var(--text-secondary)' }}>{list?.title}</strong>
              {card.watching && <span className="ml-2">👁 Watching</span>}
            </p>
          </div>
          <button onClick={close} className="text-lg shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70 transition-opacity" style={{ color: 'var(--text-muted)' }}>✕</button>
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
                    }}
                    className="px-2 py-1 rounded text-[10px] font-bold text-white transition-all"
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
                    onClick={() => dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, memberIds: card.memberIds.filter(x => x !== m.id) } })}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium text-white transition-opacity hover:opacity-80"
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
                      if (e.target.value) dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, memberIds: [...card.memberIds, e.target.value] } });
                    }}
                    className="text-xs px-2 py-1 rounded border bg-transparent cursor-pointer"
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
                  onChange={e => dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, dueDate: e.target.value ? new Date(e.target.value).toISOString() : null } })}
                  className="text-xs px-2 py-1 rounded border bg-transparent"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                {card.dueDate && (
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={card.dueDateComplete}
                      onChange={() => dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, dueDateComplete: !card.dueDateComplete } })}
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
                onChange={e => dispatch({ type: 'MOVE_CARD', payload: { cardId: card.id, toListId: e.target.value, toPosition: 0 } })}
                className="text-xs px-2 py-1 rounded border bg-transparent cursor-pointer"
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
                    <button onClick={() => { dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, description: desc } }); setDescEditing(false); }} className="px-3 py-1 rounded text-xs font-medium text-white" style={{ background: 'var(--accent)' }}>Save</button>
                    <button onClick={() => { setDesc(card.description); setDescEditing(false); }} className="px-2 py-1 text-xs" style={{ color: 'var(--text-muted)' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => setDescEditing(true)}
                  className="px-3 py-2 rounded-lg text-sm cursor-pointer min-h-[40px]"
                  style={{ background: 'var(--input-bg)', color: card.description ? 'var(--text-primary)' : 'var(--text-muted)' }}
                >
                  {card.description || 'Add a description…'}
                </div>
              )}
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
                      <div key={item.id} className="flex items-center gap-2 py-0.5 group">
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => dispatch({ type: 'TOGGLE_CHECKLIST_ITEM', payload: { cardId: card.id, checklistId: cl.id, itemId: item.id } })}
                          className="rounded shrink-0"
                        />
                        <span className="text-sm flex-1" style={{ color: 'var(--text-primary)', textDecoration: item.completed ? 'line-through' : 'none', opacity: item.completed ? 0.5 : 1 }}>{item.text}</span>
                        <button
                          onClick={() => dispatch({ type: 'DELETE_CHECKLIST_ITEM', payload: { cardId: card.id, checklistId: cl.id, itemId: item.id } })}
                          className="opacity-0 group-hover:opacity-100 text-[10px] transition-opacity"
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
                              setNewItemText('');
                            }
                            if (e.key === 'Escape') { setAddingItemTo(null); setNewItemText(''); }
                          }}
                          placeholder="Item text…"
                          className="flex-1 px-2 py-1 text-xs rounded border bg-transparent outline-none"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        />
                        <button onClick={() => {
                          if (newItemText.trim()) dispatch({ type: 'ADD_CHECKLIST_ITEM', payload: { cardId: card.id, checklistId: cl.id, text: newItemText.trim() } });
                          setNewItemText('');
                        }} className="text-xs px-2 py-1 rounded text-white" style={{ background: 'var(--accent)' }}>Add</button>
                        <button onClick={() => { setAddingItemTo(null); setNewItemText(''); }} className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setAddingItemTo(cl.id)} className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>+ Add item</button>
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
                    if (newChecklistTitle.trim()) dispatch({ type: 'ADD_CHECKLIST', payload: { cardId: card.id, title: newChecklistTitle.trim() } });
                    setNewChecklistTitle(''); setAddingChecklist(false);
                  }} className="text-xs px-2 py-1 rounded text-white" style={{ background: 'var(--accent)' }}>Add</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingChecklist(true)} className="text-xs mb-4 block" style={{ color: 'var(--accent)' }}>+ Add checklist</button>
            )}

            {/* Tabs: Comments / Activity */}
            <div className="flex gap-3 border-b mb-3" style={{ borderColor: 'var(--border)' }}>
              {(['details', 'activity'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="text-xs font-medium pb-2 capitalize transition-colors"
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
                        onClick={() => { dispatch({ type: 'ADD_COMMENT', payload: { cardId: card.id, text: comment.trim() } }); setComment(''); }}
                        className="mt-1 px-3 py-1 rounded text-xs font-medium text-white"
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
              onClick={() => dispatch({ type: 'UPDATE_CARD', payload: { id: card.id, watching: !card.watching } })}
              className="w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors"
              style={{ background: 'var(--active-bg)', color: 'var(--text-secondary)' }}
            >
              {card.watching ? '👁 Watching' : '👁 Watch'}
            </button>
            <button
              onClick={() => { dispatch({ type: 'ARCHIVE_CARD', payload: card.id }); }}
              className="w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors"
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
