import { useState } from 'react';

type AuthMode = 'login' | 'bootstrap' | 'password-change' | 'recovery';

interface AuthScreenProps {
  mode: AuthMode;
  title: string;
  subtitle: string;
  error?: string | null;
  newRecoveryKey?: string | null;
  initialUsername?: string;
  initialRecoveryKey?: string;
  onLogin?: (username: string, password: string) => Promise<void>;
  onBootstrap?: (username: string, password: string, confirmPassword: string) => Promise<void>;
  onChangePassword?: (currentPassword: string, nextPassword: string, confirmPassword: string) => Promise<void>;
  onRecovery?: (username: string, recoveryKey: string, newPassword: string, confirmPassword: string) => Promise<void>;
  onSwitchToRecovery?: () => void;
  onSwitchToLogin?: () => void;
}

const inputStyle = { background: '#10232d', color: '#f4efe8' };

function Field({ id, label, type = 'text', value, onChange }: { id: string; label: string; type?: string; value: string; onChange: (v: string) => void }) {
  return (
    <>
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-[0.2em] mb-2">{label}</label>
      <input id={id} aria-label={label} type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full rounded-xl px-4 py-3 mb-4" style={inputStyle} />
    </>
  );
}

export function AuthScreen({ mode, title, subtitle, error, newRecoveryKey, initialUsername, initialRecoveryKey, onLogin, onBootstrap, onChangePassword, onRecovery, onSwitchToRecovery, onSwitchToLogin }: AuthScreenProps) {
  const [username, setUsername] = useState(initialUsername ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [nextConfirm, setNextConfirm] = useState('');
  const [recoveryKey, setRecoveryKey] = useState(initialRecoveryKey ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setLocalError(null);

    try {
      if (mode === 'login') {
        await onLogin?.(username, password);
      } else if (mode === 'bootstrap') {
        if (password.length < 10) { setLocalError('Password must be at least 10 characters long.'); return; }
        if (password !== confirmPassword) { setLocalError('Passwords do not match.'); return; }
        await onBootstrap?.(username, password, confirmPassword);
      } else if (mode === 'password-change') {
        if (nextPassword.length < 10) { setLocalError('Password must be at least 10 characters long.'); return; }
        if (nextPassword !== nextConfirm) { setLocalError('New passwords do not match.'); return; }
        await onChangePassword?.(currentPassword, nextPassword, nextConfirm);
      } else if (mode === 'recovery') {
        if (nextPassword.length < 10) { setLocalError('Password must be at least 10 characters long.'); return; }
        if (nextPassword !== nextConfirm) { setLocalError('Passwords do not match.'); return; }
        await onRecovery?.(username, recoveryKey, nextPassword, nextConfirm);
      }
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  }

  const buttonLabel = {
    login: 'Sign in',
    bootstrap: 'Create admin account',
    'password-change': 'Update password',
    recovery: 'Reset password',
  }[mode];

  return (
    <div className="min-h-screen px-6 py-12 flex items-center justify-center overflow-y-auto" style={{ background: 'linear-gradient(135deg, #07141f 0%, #102f3d 45%, #e2a56a 100%)' }}>
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-3xl border p-8 shadow-2xl" style={{ background: 'rgba(9, 20, 28, 0.9)', borderColor: 'rgba(255,255,255,0.12)', color: '#f4efe8' }}>
        <p className="text-[11px] uppercase tracking-[0.35em] mb-3" style={{ color: '#d4b692' }}>Strata Platform</p>
        <h1 className="text-3xl font-bold mb-2">{title}</h1>
        <p className="text-sm mb-6" style={{ color: '#b6c4cc' }}>{subtitle}</p>

        {mode === 'login' && (
          <>
            <Field id="auth-username" label="Username" value={username} onChange={setUsername} />
            <Field id="auth-password" label="Password" type="password" value={password} onChange={setPassword} />
          </>
        )}

        {mode === 'bootstrap' && (
          <>
            <Field id="auth-username" label="Admin username" value={username} onChange={setUsername} />
            <Field id="auth-password" label="Password" type="password" value={password} onChange={setPassword} />
            <Field id="auth-confirm-password" label="Confirm password" type="password" value={confirmPassword} onChange={setConfirmPassword} />
          </>
        )}

        {mode === 'password-change' && (
          <>
            <Field id="auth-current-password" label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} />
            <Field id="auth-next-password" label="New password" type="password" value={nextPassword} onChange={setNextPassword} />
            <Field id="auth-confirm-password" label="Confirm new password" type="password" value={nextConfirm} onChange={setNextConfirm} />
          </>
        )}

        {mode === 'recovery' && (
          <>
            <Field id="auth-username" label="Username" value={username} onChange={setUsername} />
            <Field id="auth-recovery-key" label="Recovery key" value={recoveryKey} onChange={setRecoveryKey} />
            <Field id="auth-next-password" label="New password" type="password" value={nextPassword} onChange={setNextPassword} />
            <Field id="auth-confirm-password" label="Confirm new password" type="password" value={nextConfirm} onChange={setNextConfirm} />
          </>
        )}

        {(error || localError) && <p className="text-sm mb-4" style={{ color: '#ffb4b4' }}>{error || localError}</p>}

        {newRecoveryKey && (
          <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
            <p className="text-xs font-bold uppercase tracking-[0.2em] mb-2" style={{ color: '#86efac' }}>New Recovery Key</p>
            <p className="text-xs mb-2" style={{ color: '#b6c4cc' }}>Save this key somewhere safe. You will need it if you forget your password again.</p>
            <code className="block break-all select-all text-xs mb-3" style={{ color: '#f4efe8' }}>{newRecoveryKey}</code>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ background: copied ? '#22c55e' : '#e2a56a', color: '#132530' }}
              onClick={() => { void navigator.clipboard.writeText(newRecoveryKey); setCopied(true); }}
            >
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
          </div>
        )}

        {mode === 'recovery' && newRecoveryKey ? (
          <button type="button" onClick={onSwitchToLogin} className="w-full rounded-xl px-4 py-3 font-semibold" style={{ background: '#e2a56a', color: '#132530' }}>
            Proceed to Login
          </button>
        ) : (
          <button type="submit" disabled={submitting} className="w-full rounded-xl px-4 py-3 font-semibold" style={{ background: '#e2a56a', color: '#132530' }}>
            {submitting ? 'Working...' : buttonLabel}
          </button>
        )}

        {mode === 'login' && onSwitchToRecovery && (
          <button type="button" onClick={onSwitchToRecovery} className="w-full mt-3 text-sm underline opacity-70 hover:opacity-100" style={{ color: '#b6c4cc' }}>
            Forgot password?
          </button>
        )}

        {mode === 'recovery' && !newRecoveryKey && onSwitchToLogin && (
          <button type="button" onClick={onSwitchToLogin} className="w-full mt-3 text-sm underline opacity-70 hover:opacity-100" style={{ color: '#b6c4cc' }}>
            Back to sign in
          </button>
        )}
      </form>
    </div>
  );
}
