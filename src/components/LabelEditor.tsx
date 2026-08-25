import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { uid } from '../data';
import type { Label } from '../types';

interface LabelEditorProps {
  labels: Label[];
  onSave: (labels: Label[]) => Promise<void> | void;
  onCancel: () => void;
  usageCount?: (labelId: string) => number;
  autoFocus?: boolean;
}

const LABEL_COLOR_OPTIONS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899'];

function contrastingTextColor(color: string) {
  const normalized = color.slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return ((red * 0.299) + (green * 0.587) + (blue * 0.114)) > 160 ? '#111827' : '#ffffff';
}

export function LabelEditor({ labels, onSave, onCancel, usageCount = () => 0, autoFocus = false }: LabelEditorProps) {
  const [draftLabels, setDraftLabels] = useState(() => labels.map(label => ({ ...label })));
  const [activeColorId, setActiveColorId] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) firstInputRef.current?.focus();
  }, [autoFocus]);

  const pickColor = () => {
    const used = new Set(draftLabels.map(label => label.color.toLowerCase()));
    return LABEL_COLOR_OPTIONS.find(color => !used.has(color)) ?? LABEL_COLOR_OPTIONS[draftLabels.length % LABEL_COLOR_OPTIONS.length];
  };

  const save = async () => {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await onSave(draftLabels.map(label => ({ ...label, name: label.name.trim(), color: label.color.toLowerCase() })));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Labels could not be saved.');
    } finally {
      setPending(false);
    }
  };

  const cancel = () => {
    if (pending) return;
    setDraftLabels(labels.map(label => ({ ...label })));
    setActiveColorId(null);
    setDeleteCandidateId(null);
    setError('');
    onCancel();
  };

  const deleteCandidate = deleteCandidateId ? draftLabels.find(label => label.id === deleteCandidateId) ?? null : null;

  return (
    <div className="relative flex min-h-0 flex-col">
      <div className="max-h-[min(26rem,55vh)] space-y-3 overflow-y-auto pr-1">
        {draftLabels.map((label, index) => (
          <div key={label.id} className="grid grid-cols-[minmax(0,1fr)_52px_52px] items-center gap-2 rounded-xl border p-2" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.03)' }}>
            <input
              ref={index === 0 ? firstInputRef : undefined}
              value={label.name}
              maxLength={50}
              disabled={pending}
              onChange={event => setDraftLabels(current => current.map(candidate => candidate.id === label.id ? { ...candidate, name: event.target.value } : candidate))}
              placeholder="Label name"
              aria-label={`Label name for ${label.name || 'new label'}`}
              className="min-h-[44px] min-w-0 rounded-md border px-3 text-sm font-semibold outline-none disabled:opacity-60"
              style={{ background: label.color, borderColor: 'transparent', color: contrastingTextColor(label.color) }}
            />
            <button
              type="button"
              aria-label={`Choose color for ${label.name || 'new label'}`}
              disabled={pending}
              onClick={() => setActiveColorId(current => current === label.id ? null : label.id)}
              className="h-11 w-11 rounded-md border disabled:opacity-60"
              style={{ background: label.color, borderColor: 'var(--border)' }}
            />
            <button
              type="button"
              aria-label={`Delete ${label.name || 'color-only label'}`}
              disabled={pending}
              onClick={() => setDeleteCandidateId(label.id)}
              className="flex h-11 w-11 items-center justify-center rounded-md disabled:opacity-60"
              style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}
            ><Trash2 size={16} /></button>
            {activeColorId === label.id && (
              <div className="col-span-3 rounded-xl border p-3" style={{ background: 'var(--dropdown-bg)', borderColor: 'var(--border)' }}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Choose a color</span>
                  <button type="button" aria-label="Close color selector" onClick={() => setActiveColorId(null)} className="flex h-9 w-9 items-center justify-center rounded-full"><X size={15} /></button>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {LABEL_COLOR_OPTIONS.map(color => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Select ${color}`}
                      onClick={() => {
                        setDraftLabels(current => current.map(candidate => candidate.id === label.id ? { ...candidate, color } : candidate));
                        setActiveColorId(null);
                      }}
                      className="h-10 w-10 rounded-full border"
                      style={{ background: color, borderColor: color === label.color.toLowerCase() ? '#ffffff' : 'rgba(255,255,255,0.18)' }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        aria-label="Add new label"
        disabled={pending}
        onClick={() => setDraftLabels(current => [...current, { id: uid(), name: '', color: pickColor() }])}
        className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-medium disabled:opacity-60"
        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
      ><Plus size={16} /> Add new label</button>

      {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
        <button type="button" aria-label="Cancel label changes" disabled={pending} onClick={cancel} className="min-h-[44px] px-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
        <button type="button" aria-label="Save labels" disabled={pending} onClick={() => void save()} className="min-h-[44px] rounded-md px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60" style={{ background: 'var(--accent)' }}>{pending ? 'Saving…' : 'Save'}</button>
      </div>

      {deleteCandidate && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl p-4" style={{ background: 'rgba(5,7,12,0.86)' }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-label-title" className="w-full max-w-sm rounded-2xl border p-4 shadow-2xl" style={{ background: 'var(--modal-bg)', borderColor: 'var(--border)' }}>
            <h3 id="delete-label-title" className="font-bold" style={{ color: 'var(--text-primary)' }}>Delete {deleteCandidate.name || 'color-only label'}?</h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              This removes the shared label from {usageCount(deleteCandidate.id)} {usageCount(deleteCandidate.id) === 1 ? 'card' : 'cards'} and any automation rules on this board after you save.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteCandidateId(null)} className="min-h-[44px] px-3 text-sm" style={{ color: 'var(--text-secondary)' }}>Keep label</button>
              <button
                type="button"
                aria-label="Confirm delete label"
                onClick={() => {
                  setDraftLabels(current => current.filter(label => label.id !== deleteCandidate.id));
                  setDeleteCandidateId(null);
                }}
                className="min-h-[44px] rounded-md bg-red-600 px-3 text-sm font-semibold text-white"
              >Delete label</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
