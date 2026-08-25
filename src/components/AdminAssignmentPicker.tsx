import { useEffect, useMemo, useState } from 'react';
import type { AdminResourceItem, AdminResourcePage } from '../types';

export function AdminAssignmentPicker({
  label, description, selectedIds, onChange, loadPage, disabled = false,
}: {
  label: string;
  description: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  loadPage: (input: { query: string; page: number; selectedIds: string[] }) => Promise<AdminResourcePage>;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AdminResourcePage | null>(null);
  const [known, setKnown] = useState<Record<string, AdminResourceItem>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void loadPage({ query, page, selectedIds }).then(next => {
        if (!live) return;
        setResult(next);
        setKnown(current => ({ ...current, ...Object.fromEntries([...next.items, ...(next.selectedItems ?? [])].map(item => [item.id, item])) }));
        setError(null);
      }).catch(cause => {
        if (live) setError(cause instanceof Error ? cause.message : 'Unable to load choices.');
      }).finally(() => { if (live) setLoading(false); });
    }, 150);
    return () => { live = false; window.clearTimeout(timer); };
  }, [loadPage, page, query, selectedIds]);

  const selected = useMemo(() => selectedIds.map(id => known[id] ?? { id, name: id, kind: 'board' as const, workspaceId: null, workspaceName: null }), [known, selectedIds]);
  function toggle(id: string) {
    if (disabled) return;
    onChange(selectedIds.includes(id) ? selectedIds.filter(item => item !== id) : [...selectedIds, id]);
  }
  const name = (item: AdminResourceItem) => item.kind === 'board' && item.workspaceName ? `${item.workspaceName} / ${item.name}` : item.name;

  return (
    <fieldset className="rounded-xl border p-3" style={{ borderColor: '#334155' }} disabled={disabled}>
      <legend className="px-1 text-sm font-bold">{label}</legend>
      <p className="mb-3 text-xs" style={{ color: '#9bb1c0' }}>{description}</p>
      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2" aria-label={`Selected ${label}`}>
          {selected.map(item => <button key={item.id} type="button" className="rounded-full px-3 py-1 text-xs" style={{ background: '#274060' }} onClick={() => toggle(item.id)}>{name(item)} <span aria-hidden>×</span></button>)}
        </div>
      )}
      <input aria-label={`Search ${label}`} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search…" className="mb-2 w-full rounded-lg px-3 py-2 text-sm" style={{ background: '#0d141c' }} />
      <div className="max-h-44 space-y-1 overflow-y-auto" aria-live="polite">
        {loading && <p className="p-2 text-xs" style={{ color: '#9bb1c0' }}>Loading…</p>}
        {!loading && error && <p className="p-2 text-xs" style={{ color: '#ffb4b4' }}>{error}</p>}
        {!loading && !error && result?.items.length === 0 && <p className="p-2 text-xs" style={{ color: '#9bb1c0' }}>No matching choices.</p>}
        {!loading && result?.items.map(item => (
          <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-800">
            <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggle(item.id)} />
            <span className="min-w-0 text-sm">{name(item)}</span>
          </label>
        ))}
      </div>
      {result && result.page.totalPages > 1 && (
        <div className="mt-2 flex items-center justify-between text-xs">
          <button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button>
          <span>Page {result.page.page} of {result.page.totalPages}</span>
          <button type="button" disabled={page >= result.page.totalPages} onClick={() => setPage(value => value + 1)}>Next</button>
        </div>
      )}
    </fieldset>
  );
}
