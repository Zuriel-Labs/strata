import { useState } from 'react';

interface AuthScreenProps {
  mode: 'login' | 'password-change';
  title: string;
  subtitle: string;
  error?: string | null;
  onSubmit: (values: { email?: string; password?: string; currentPassword?: string; nextPassword?: string }) => Promise<void>;
}

export function AuthScreen({ mode, title, subtitle, error, onSubmit }: AuthScreenProps) {
  const [email, setEmail] = useState('admin@strata.local');
  const [password, setPassword] = useState('ChangeMe123!');
  const [currentPassword, setCurrentPassword] = useState('ChangeMe123!');
  const [nextPassword, setNextPassword] = useState('ChangeThisNow123!');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setLocalError(null);
    try {
      if (mode === 'login') {
        await onSubmit({ email, password });
      } else {
        await onSubmit({ currentPassword, nextPassword });
      }
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-12 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #07141f 0%, #102f3d 45%, #e2a56a 100%)' }}>
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-3xl border p-8 shadow-2xl" style={{ background: 'rgba(9, 20, 28, 0.9)', borderColor: 'rgba(255,255,255,0.12)', color: '#f4efe8' }}>
        <p className="text-[11px] uppercase tracking-[0.35em] mb-3" style={{ color: '#d4b692' }}>Strata Platform</p>
        <h1 className="text-3xl font-bold mb-2">{title}</h1>
        <p className="text-sm mb-6" style={{ color: '#b6c4cc' }}>{subtitle}</p>

        {mode === 'login' ? (
          <>
            <label htmlFor="auth-email" className="block text-xs font-semibold uppercase tracking-[0.2em] mb-2">Email</label>
            <input id="auth-email" aria-label="Email" value={email} onChange={event => setEmail(event.target.value)} className="w-full rounded-xl px-4 py-3 mb-4" style={{ background: '#10232d', color: '#f4efe8' }} />
            <label htmlFor="auth-password" className="block text-xs font-semibold uppercase tracking-[0.2em] mb-2">Password</label>
            <input id="auth-password" aria-label="Password" type="password" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-xl px-4 py-3 mb-4" style={{ background: '#10232d', color: '#f4efe8' }} />
          </>
        ) : (
          <>
            <label htmlFor="auth-current-password" className="block text-xs font-semibold uppercase tracking-[0.2em] mb-2">Current password</label>
            <input id="auth-current-password" aria-label="Current password" type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="w-full rounded-xl px-4 py-3 mb-4" style={{ background: '#10232d', color: '#f4efe8' }} />
            <label htmlFor="auth-next-password" className="block text-xs font-semibold uppercase tracking-[0.2em] mb-2">New password</label>
            <input id="auth-next-password" aria-label="New password" type="password" value={nextPassword} onChange={event => setNextPassword(event.target.value)} className="w-full rounded-xl px-4 py-3 mb-4" style={{ background: '#10232d', color: '#f4efe8' }} />
          </>
        )}

        {(error || localError) && <p className="text-sm mb-4" style={{ color: '#ffb4b4' }}>{error || localError}</p>}

        <button type="submit" disabled={submitting} className="w-full rounded-xl px-4 py-3 font-semibold" style={{ background: '#e2a56a', color: '#132530' }}>
          {submitting ? 'Working...' : mode === 'login' ? 'Sign in' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
