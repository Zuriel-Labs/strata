import { useState } from 'react';
import { useAppState } from '../store';
import { useAuth } from '../lib/auth-context';
import { setListColor } from '../services/content';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';

export function ListPresentationDialog({ listId, onClose }: { listId: string; onClose: () => void }) {
  const list = useAppState().lists.find(item => item.id === listId);
  const auth = useAuth();
  const [color, setColor] = useState(list?.color ?? '');
  const [revision] = useState(list?.revision ?? 0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}><DialogContent className="w-[calc(100%-1.5rem)] max-h-[calc(100dvh-1.5rem)] overflow-y-auto" style={{ background: 'var(--modal-bg)', color: 'var(--text-primary)' }}>
    <DialogTitle>List color</DialogTitle><DialogDescription>Shared color for {list?.title}. Personal collapse remains separate.</DialogDescription>
    <label className="text-sm">Color<select aria-label="Color" value={color} disabled={pending} onChange={event => setColor(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2">{[['', 'None'], ['#6366f1', 'Indigo'], ['#0891b2', 'Cyan'], ['#059669', 'Green'], ['#ea580c', 'Orange'], ['#dc2626', 'Red'], ['#7c3aed', 'Violet'], ['#be185d', 'Pink']].map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={pending} onClick={onClose}>Cancel</Button><Button disabled={pending || !list} onClick={async () => {
      if (!list) return; setPending(true); setError('');
      try { await setListColor(list.id, color || null, revision); await auth.refresh(); onClose(); }
      catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save list color.'); }
      finally { setPending(false); }
    }}>{pending ? 'Saving…' : 'Save color'}</Button></div>
  </DialogContent></Dialog>;
}
