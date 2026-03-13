import { useAuth } from '../lib/auth-context';

export function AccessDenied() {
  const { accessDenied, setAccessDenied } = useAuth();
  if (!accessDenied) return null;

  return (
    <div className="fixed bottom-4 right-4 w-80 rounded-xl border px-4 py-3 shadow-2xl z-50" style={{ background: '#23181b', borderColor: '#6b2b34', color: '#ffd8de' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] mb-1">Access denied</p>
          <p className="text-sm">{accessDenied}</p>
        </div>
        <button className="text-xs underline" onClick={() => setAccessDenied(null)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
