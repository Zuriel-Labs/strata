import { useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { generateRecoveryKey } from '../services/session';

export function ProfileOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth();
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center pt-16" style={{ background: 'rgba(6, 9, 14, 0.6)' }} onClick={e => { if (e.target === e.currentTarget) { onClose(); setRecoveryKey(null); } }}>
      <div className="w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden" style={{ background: 'var(--modal-bg)', borderColor: 'var(--border)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ background: auth.session?.user.color ?? '#6366f1' }}>
            {auth.session?.user.initials ?? 'SA'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{auth.session?.user.name}</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{auth.session?.user.username}</p>
          </div>
          <button className="w-8 h-8 rounded-md flex items-center justify-center text-sm shrink-0" style={{ color: 'var(--text-muted)', background: 'var(--active-bg)' }} onClick={() => { onClose(); setRecoveryKey(null); }}>✕</button>
        </div>

        {/* Actions */}
        <div className="p-3 space-y-1">
          <button
            onClick={async () => {
              const result = await generateRecoveryKey();
              setRecoveryKey(result.recoveryKey);
              setCopied(false);
            }}
            className="w-full text-left px-3 min-h-[44px] flex items-center gap-2 rounded-lg text-xs transition-colors hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
            Generate recovery key
          </button>

          {recoveryKey && (
            <div className="px-3 py-3 rounded-lg text-xs" style={{ background: 'var(--active-bg)' }}>
              <p className="font-semibold mb-1" style={{ color: '#d9f99d' }}>Save this key securely:</p>
              <code className="block break-all select-all mb-2" style={{ color: 'var(--text-primary)' }}>{recoveryKey}</code>
              <button
                onClick={() => { void navigator.clipboard.writeText(recoveryKey); setCopied(true); }}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{ background: copied ? '#22c55e' : 'var(--accent)', color: '#fff' }}
              >
                {copied ? 'Copied!' : 'Copy to clipboard'}
              </button>
            </div>
          )}

          <button
            onClick={() => { onClose(); setRecoveryKey(null); void auth.logout(); }}
            className="w-full text-left px-3 min-h-[44px] flex items-center gap-2 rounded-lg text-xs transition-colors hover:opacity-80"
            style={{ color: '#ffb4b4' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
