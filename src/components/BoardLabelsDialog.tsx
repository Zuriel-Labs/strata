import { X } from 'lucide-react';
import type { Label } from '../types';
import { LabelEditor } from './LabelEditor';

interface BoardLabelsDialogProps {
  open: boolean;
  labels: Label[];
  onClose: () => void;
  onSave: (labels: Label[]) => Promise<void> | void;
  maxLabelsPerBoard?: number;
  onReload?: () => Promise<void> | void;
}

export function BoardLabelsDialog({ open, labels, onClose, onSave, maxLabelsPerBoard, onReload }: BoardLabelsDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" style={{ background: 'rgba(5, 7, 12, 0.72)' }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="board-labels-title" className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{ background: 'var(--modal-bg)', borderColor: 'var(--border)', maxHeight: 'calc(100vh - 1.5rem)' }}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-4 sm:px-5" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 id="board-labels-title" className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Board labels</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Create, rename, recolor, or remove shared labels. Changes apply when you save.</p>
          </div>
          <button type="button" aria-label="Close label manager" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--active-bg)', color: 'var(--text-secondary)' }}><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <LabelEditor
            autoFocus
            labels={labels}
            maxLabelsPerBoard={maxLabelsPerBoard}
            onReload={onReload}
            onCancel={onClose}
            onSave={async nextLabels => {
              await onSave(nextLabels);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
