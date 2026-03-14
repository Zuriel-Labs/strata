import { Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Label } from '../types';
import { uid } from '../data';

interface BoardLabelsDialogProps {
  open: boolean;
  labels: Label[];
  onClose: () => void;
  onSave: (labels: Label[]) => Promise<void> | void;
}

const LABEL_COLOR_OPTIONS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899'];

export function BoardLabelsDialog({ open, labels, onClose, onSave }: BoardLabelsDialogProps) {
  const [draftLabels, setDraftLabels] = useState<Label[]>(labels);
  const [activeColorMenuLabelId, setActiveColorMenuLabelId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  const activeColorLabel = activeColorMenuLabelId
    ? draftLabels.find(label => label.id === activeColorMenuLabelId) ?? null
    : null;

  const getLabelTextColor = (color: string) => {
    const normalized = color.replace('#', '');
    if (normalized.length !== 6) return '#ffffff';
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    const luminance = (red * 0.299) + (green * 0.587) + (blue * 0.114);
    return luminance > 160 ? '#111827' : '#ffffff';
  };

  const labelRowsMinHeight = Math.max(draftLabels.length, 1) * 60;

  const commitLabels = (nextLabels: Label[]) => {
    setDraftLabels(nextLabels);
    void onSave(nextLabels);
  };

  const handleClose = () => {
    void onSave(draftLabels);
    setActiveColorMenuLabelId(null);
    onClose();
  };

  const pickRandomLabelColor = () => {
    const usedColors = new Set(draftLabels.map(label => label.color.toLowerCase()));
    const availableColors = LABEL_COLOR_OPTIONS.filter(color => !usedColors.has(color.toLowerCase()));
    const colorPool = availableColors.length > 0 ? availableColors : LABEL_COLOR_OPTIONS;
    return colorPool[Math.floor(Math.random() * colorPool.length)];
  };

  const addNewLabel = () => {
    commitLabels([...draftLabels, { id: uid(), name: '', color: pickRandomLabelColor() }]);
    requestAnimationFrame(() => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;
      if (typeof scrollContainer.scrollTo === 'function') {
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
        return;
      }
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" style={{ background: 'rgba(5, 7, 12, 0.72)' }} onClick={event => { if (event.target === event.currentTarget) handleClose(); }}>
      <div className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{ background: 'var(--modal-bg)', borderColor: 'var(--border)', maxHeight: 'calc(100vh - 1.5rem)' }}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-4 sm:px-5" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Board labels</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Create, rename, recolor, or remove labels for this board.</p>
          </div>
          <button type="button" aria-label="Close label manager" onClick={handleClose} className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: 'var(--active-bg)', color: 'var(--text-secondary)' }}><X size={18} /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5">
          <div
          ref={scrollContainerRef}
          className="overflow-y-auto"
          style={{
            overscrollBehavior: 'contain',
            minHeight: Math.min(labelRowsMinHeight, 320),
            maxHeight: 'calc(100vh - 16rem)',
          }}
        >
          <div className="space-y-3">
          {draftLabels.map(label => (
            <div key={label.id} className="grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_88px_52px] items-center gap-2 rounded-xl border p-2" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.03)' }}>
              <input
                value={label.name}
                onChange={event => commitLabels(draftLabels.map(candidate => candidate.id === label.id ? { ...candidate, name: event.target.value } : candidate))}
                placeholder="Label name"
                className="col-span-2 min-h-[44px] rounded-md border px-3 text-sm font-semibold outline-none"
                style={{ background: label.color, borderColor: 'transparent', color: getLabelTextColor(label.color) }}
              />
              <button
                type="button"
                aria-label={`Choose color for ${label.name || 'new label'}`}
                onClick={() => setActiveColorMenuLabelId(current => current === label.id ? null : label.id)}
                className="min-h-[44px] w-full rounded-md border"
                style={{ background: label.color, borderColor: 'var(--border)' }}
              />
              <button
                type="button"
                aria-label={`Remove ${label.name || 'label'}`}
                onClick={() => commitLabels(draftLabels.filter(candidate => candidate.id !== label.id))}
                className="flex min-h-[44px] items-center justify-center rounded-md"
                style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          </div>
        </div>
            <button
              type="button"
              onClick={addNewLabel}
              className="mt-3 grid w-full shrink-0 grid-cols-[minmax(0,2fr)_minmax(0,2fr)_88px_52px] items-center rounded-xl border border-dashed p-2 text-sm font-medium transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)' }}
            >
              <span className="col-span-4 flex min-h-[44px] items-center justify-center rounded-md border border-dashed" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
                Add New Label
              </span>
            </button>
        </div>

        <div className="shrink-0 border-t px-4 py-4 sm:px-5" style={{ borderColor: 'var(--border)', background: 'var(--modal-bg)' }}>
          <div className="h-2" aria-hidden="true" />
        </div>

        {activeColorLabel && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4" onClick={() => setActiveColorMenuLabelId(null)} style={{ background: 'rgba(5, 7, 12, 0.48)' }}>
            <div className="w-full max-w-xs rounded-2xl border p-4 shadow-2xl" onClick={event => event.stopPropagation()} style={{ background: 'var(--dropdown-bg)', borderColor: 'var(--border)' }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Choose label color</h3>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{activeColorLabel.name || 'Color-only label'}</p>
                </div>
                <button type="button" aria-label="Close color selector" onClick={() => setActiveColorMenuLabelId(null)} className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'var(--active-bg)', color: 'var(--text-secondary)' }}>
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {LABEL_COLOR_OPTIONS.map(color => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Select ${color}`}
                    onClick={() => {
                      commitLabels(draftLabels.map(candidate => candidate.id === activeColorLabel.id ? { ...candidate, color } : candidate));
                      setActiveColorMenuLabelId(null);
                    }}
                    className="h-10 w-10 rounded-full border transition-transform hover:scale-105"
                    style={{ background: color, borderColor: color.toLowerCase() === activeColorLabel.color.toLowerCase() ? '#ffffff' : 'rgba(255,255,255,0.18)' }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
