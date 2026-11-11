import { ConnectionsPanel } from './ConnectionsPanel';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { getContrastingTextColor } from '../lib/color';
import { toast } from '../hooks/use-toast';
import { generateRecoveryKey } from '../services/session';
import type { ThemePreference } from '../types';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

const PROFILE_COLOR_OPTIONS = [
  '#315ddc',
  '#0f9f6e',
  '#d97706',
  '#dc4c64',
  '#7c3aed',
  '#0891b2',
  '#0f766e',
  '#b45309',
];

type OverlayView = 'menu' | 'profile' | 'preferences' | 'security' | 'connections';

type Notice = {
  tone: 'success' | 'error';
  message: string;
};

function normalizeInitials(value: string) {
  return value.replace(/\s+/g, '').toUpperCase().slice(0, 4);
}

export function ProfileOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth();
  const sessionUser = auth.session?.user;
  const appState = auth.session?.appState;
  const [view, setView] = useState<OverlayView>('menu');
  const [displayName, setDisplayName] = useState(sessionUser?.name ?? '');
  const [initials, setInitials] = useState(sessionUser?.initials ?? '');
  const [avatarColor, setAvatarColor] = useState(sessionUser?.color ?? PROFILE_COLOR_OPTIONS[0]);
  const [themePreference, setThemePreference] = useState<ThemePreference>(sessionUser?.themePreference ?? 'dark');
  const [defaultWorkspaceId, setDefaultWorkspaceId] = useState<string | null>(sessionUser?.defaultWorkspaceId ?? null);
  const [defaultBoardId, setDefaultBoardId] = useState<string | null>(sessionUser?.defaultBoardId ?? null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [copiedRecoveryKey, setCopiedRecoveryKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const sessionUserRef = useRef(sessionUser);
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const lastViewRef = useRef<OverlayView>('profile');

  const previewColor = avatarColor || sessionUser?.color || PROFILE_COLOR_OPTIONS[0];
  const previewInitials = initials || sessionUser?.initials || 'SA';
  const avatarTextColor = useMemo(() => getContrastingTextColor(previewColor), [previewColor]);

  useEffect(() => {
    sessionUserRef.current = sessionUser;
  }, [sessionUser]);

  useEffect(() => {
    const currentUser = sessionUserRef.current;
    if (!open || !currentUser) return;
    setView('menu');
    setDisplayName(currentUser.name);
    setInitials(currentUser.initials);
    setAvatarColor(currentUser.color);
    setThemePreference(currentUser.themePreference);
    setDefaultWorkspaceId(currentUser.defaultWorkspaceId ?? null);
    setDefaultBoardId(currentUser.defaultBoardId ?? null);
    setCurrentPassword('');
    setNextPassword('');
    setConfirmPassword('');
    setRecoveryKey(null);
    setCopiedRecoveryKey(false);
    setSubmitting(false);
    setNotice(null);
  }, [open, sessionUser?.id]);

  useEffect(() => {
    if (!open) return;
    const selector = view === 'menu' ? `[data-account-view="${lastViewRef.current}"]` : '[aria-label="Back to account menu"]';
    contentRef.current?.querySelector<HTMLElement>(selector)?.focus();
  }, [open, view]);

  if (!open || !sessionUser) return null;

  const closeOverlay = () => {
    if (submitting) return;
    onClose();
  };

  const openView = (nextView: OverlayView) => {
    lastViewRef.current = nextView;
    setNotice(null);
    setView(nextView);
  };

  const goBack = () => {
    if (submitting) return;
    setNotice(null);
    setDisplayName(sessionUser.name);
    setInitials(sessionUser.initials);
    setAvatarColor(sessionUser.color);
    setThemePreference(sessionUser.themePreference);
    setDefaultWorkspaceId(sessionUser.defaultWorkspaceId ?? null);
    setDefaultBoardId(sessionUser.defaultBoardId ?? null);
    setCurrentPassword('');
    setNextPassword('');
    setConfirmPassword('');
    setRecoveryKey(null);
    setCopiedRecoveryKey(false);
    setView('menu');
  };

  const handleProfileSave = async () => {
    const trimmedName = displayName.trim();
    const normalized = normalizeInitials(initials);

    if (!trimmedName) {
      setNotice({ tone: 'error', message: 'Display name is required.' });
      return;
    }
    if (!normalized) {
      setNotice({ tone: 'error', message: 'Initials are required.' });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      await auth.updateProfile(trimmedName, normalized, avatarColor);
      setDisplayName(trimmedName);
      setInitials(normalized);
      setNotice({ tone: 'success', message: 'Profile updated.' });
      toast({ title: 'Profile updated', description: 'Your display name and avatar details were saved.' });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to save profile.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreferencesSave = async () => {
    setSubmitting(true);
    setNotice(null);

    try {
      await auth.updatePreferences(themePreference, defaultWorkspaceId, defaultBoardId);
      setNotice({ tone: 'success', message: 'Preferences updated.' });
      toast({ title: 'Preferences updated', description: 'Your preferences have been saved.' });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to save preferences.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSecurityChange = async () => {
    if (!currentPassword || !nextPassword || !confirmPassword) {
      setNotice({ tone: 'error', message: 'All password fields are required.' });
      return;
    }
    if (nextPassword.length < 10) {
      setNotice({ tone: 'error', message: 'New password must be at least 10 characters long.' });
      return;
    }
    if (nextPassword !== confirmPassword) {
      setNotice({ tone: 'error', message: 'New passwords do not match.' });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      await auth.changePassword(currentPassword, nextPassword, confirmPassword);
      setCurrentPassword('');
      setNextPassword('');
      setConfirmPassword('');
      setNotice({ tone: 'success', message: 'Password changed successfully.' });
      toast({ title: 'Password updated', description: 'Your password has been changed.' });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to change password.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecoveryKeyGenerate = async () => {
    setSubmitting(true);
    setNotice(null);

    try {
      const result = await generateRecoveryKey();
      setRecoveryKey(result.recoveryKey);
      setCopiedRecoveryKey(false);
      setNotice({ tone: 'success', message: 'A new recovery key is ready. Save it before closing this panel.' });
      toast({ title: 'Recovery key generated', description: 'Save the new recovery key somewhere safe.' });
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to generate a recovery key.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setSubmitting(true);
    setNotice(null);

    try {
      await auth.logout();
      onClose();
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to sign out.' });
      setSubmitting(false);
    }
  };

  const renderNotice = () => notice && (
    <div
      role={notice.tone === 'error' ? 'alert' : 'status'}
      className="rounded-xl border px-3 py-3 text-sm"
      style={{
        background: notice.tone === 'success' ? 'rgba(50,196,141,0.12)' : 'rgba(255,107,107,0.12)',
        borderColor: notice.tone === 'success' ? 'rgba(50,196,141,0.32)' : 'rgba(255,107,107,0.28)',
        color: notice.tone === 'success' ? 'var(--text-primary)' : '#ffd4d4',
      }}
    >
      {notice.message}
    </div>
  );

  const renderSubheader = (title: string, description: string) => (
    <div className="flex items-start justify-between gap-3 border-b px-4 py-4 sm:px-5" style={{ borderColor: 'var(--border)' }}>
      <button
        type="button"
        aria-label="Back to account menu"
        onClick={goBack}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border"
        style={{ color: 'var(--text-secondary)', background: 'var(--active-bg)', borderColor: 'var(--border)' }}
      >
        <span aria-hidden="true">&larr;</span>
      </button>
      <div className="min-w-0 flex-1 px-1 text-center">
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>{description}</p>
      </div>
      <button
        type="button"
        aria-label="Close account menu"
        onClick={closeOverlay}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border"
        style={{ color: 'var(--text-secondary)', background: 'var(--active-bg)', borderColor: 'var(--border)' }}
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={nextOpen => { if (!nextOpen) closeOverlay(); }}>
      <DialogContent
        ref={contentRef}
        showCloseButton={false}
        aria-describedby={undefined}
        className="top-12 translate-y-0 w-[calc(100%-1.5rem)] max-w-md max-h-[calc(100dvh-4rem)] gap-0 overflow-y-auto rounded-[28px] p-0 shadow-2xl sm:top-16 sm:max-h-[calc(100dvh-5rem)]"
        style={{ background: 'var(--modal-bg)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)', color: 'var(--text-primary)' }}
        onOpenAutoFocus={() => {
          returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
        }}
        onEscapeKeyDown={event => {
          event.preventDefault();
          if (submitting) return;
          if (view === 'menu') closeOverlay();
          else goBack();
        }}
        onPointerDownOutside={event => { if (submitting) event.preventDefault(); }}
      >
        <DialogTitle className="sr-only">Account menu</DialogTitle>
        {view === 'menu' ? (
          <>
            <div className="flex items-start gap-4 border-b px-4 py-5 sm:px-5" style={{ borderColor: 'var(--border)' }}>
              <div className="flex h-14 w-14 items-center justify-center rounded-full border text-lg font-bold" style={{ background: previewColor, color: avatarTextColor, borderColor: 'rgba(255,255,255,0.18)' }}>
                {previewInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--text-secondary)' }}>Account</p>
                <p className="mt-1 truncate text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{sessionUser.name}</p>
                <p className="truncate text-sm" style={{ color: 'var(--text-muted)' }}>{sessionUser.username}</p>
              </div>
              <button
                type="button"
                aria-label="Close account menu"
                onClick={closeOverlay}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border"
                style={{ color: 'var(--text-secondary)', background: 'var(--active-bg)', borderColor: 'var(--border)' }}
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </div>

            <div className="space-y-3 px-4 py-4 sm:px-5">
              <div className="rounded-2xl border p-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                <p className="text-xs uppercase tracking-[0.22em]" style={{ color: 'var(--text-secondary)' }}>Current preference</p>
                <p className="mt-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {sessionUser.themePreference === 'dark' ? 'Dark mode default' : 'Light mode selected'}
                </p>
              </div>

              {renderNotice()}

              <button data-account-view="profile" type="button" onClick={() => openView('profile')} className="flex min-h-[44px] w-full items-center justify-between rounded-2xl border px-4 py-3 text-left" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                <span>
                  <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Profile</span>
                  <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>Display name, initials, and avatar color</span>
                </span>
                <span aria-hidden="true" style={{ color: 'var(--text-secondary)' }}>&rarr;</span>
              </button>

              <button data-account-view="preferences" type="button" onClick={() => openView('preferences')} className="flex min-h-[44px] w-full items-center justify-between rounded-2xl border px-4 py-3 text-left" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                <span>
                  <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Preferences</span>
                  <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>Theme selection and future personal options</span>
                </span>
                <span aria-hidden="true" style={{ color: 'var(--text-secondary)' }}>&rarr;</span>
              </button>

              <button data-account-view="security" type="button" onClick={() => openView('security')} className="flex min-h-[44px] w-full items-center justify-between rounded-2xl border px-4 py-3 text-left" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                <span>
                  <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Security</span>
                  <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>Change your password</span>
                </span>
                <span aria-hidden="true" style={{ color: 'var(--text-secondary)' }}>&rarr;</span>
              </button>

              <button data-account-view="connections" type="button" onClick={() => openView('connections')} className="flex min-h-[44px] w-full items-center justify-between rounded-2xl border px-4 py-3 text-left" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}><span><span className="block text-sm font-semibold">API connections</span><span className="block text-xs" style={{color:'var(--text-muted)'}}>API keys, approved clients, and revocation</span></span><span aria-hidden="true">&rarr;</span></button>

              <button type="button" onClick={() => { void handleSignOut(); }} disabled={submitting} className="flex min-h-[44px] w-full items-center justify-between rounded-2xl border px-4 py-3 text-left" style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(255,107,107,0.22)', color: '#ffd4d4' }}>
                <span>
                  <span className="block text-sm font-semibold">Sign Out</span>
                  <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>Return to the login screen</span>
                </span>
                <span aria-hidden="true">&rarr;</span>
              </button>
            </div>
          </>
        ) : null}

        {view === 'profile' ? (
          <>
            {renderSubheader('Profile', 'Update the name, initials, and color shown in your account badge.')}
            <div className="space-y-4 px-4 py-4 sm:px-5">
              {renderNotice()}

              <div className="flex items-center gap-4 rounded-2xl border p-4" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                <div className="flex h-14 w-14 items-center justify-center rounded-full border text-lg font-bold" style={{ background: previewColor, color: avatarTextColor, borderColor: 'rgba(255,255,255,0.18)' }}>
                  {previewInitials}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Live preview</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Your header badge updates after you save.</p>
                </div>
              </div>

              <label className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Display name
                <input
                  aria-label="Display name"
                  type="text"
                  value={displayName}
                  onChange={event => setDisplayName(event.target.value)}
                  className="mt-2 w-full rounded-2xl border px-4 py-3"
                  style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </label>

              <label className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Initials
                <input
                  aria-label="Initials"
                  type="text"
                  maxLength={4}
                  value={initials}
                  onChange={event => setInitials(normalizeInitials(event.target.value))}
                  className="mt-2 w-full rounded-2xl border px-4 py-3 uppercase"
                  style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </label>

              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Avatar color</p>
                <div className="mt-2 grid grid-cols-4 gap-3">
                  {PROFILE_COLOR_OPTIONS.map(color => {
                    const swatchTextColor = getContrastingTextColor(color);
                    const selected = avatarColor === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Choose ${color} avatar color`}
                        aria-pressed={selected}
                        onClick={() => setAvatarColor(color)}
                        className="flex min-h-[44px] items-center justify-center rounded-2xl border text-xs font-bold"
                        style={{
                          background: color,
                          color: swatchTextColor,
                          borderColor: selected ? 'var(--accent-hover)' : 'rgba(255,255,255,0.16)',
                          boxShadow: selected ? '0 0 0 2px var(--focus-ring)' : 'none',
                        }}
                      >
                        {previewInitials}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={goBack} className="min-h-[44px] rounded-2xl border px-4 py-3 text-sm font-semibold" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
                <button type="button" onClick={() => { void handleProfileSave(); }} disabled={submitting} className="min-h-[44px] rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: 'var(--accent)', color: '#f8fbff' }}>
                  {submitting ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </div>
          </>
        ) : null}

        {view === 'connections' ? <>{renderSubheader('API connections', 'Manage the access you approve for scripts and agents.')}<ConnectionsPanel onPendingChange={setSubmitting}/></> : null}

        {view === 'preferences' ? (
          <>
            {renderSubheader('Preferences', 'Set your default workspace and board, and choose your preferred theme.')}
            <div className="space-y-4 px-4 py-4 sm:px-5">
              {renderNotice()}

              {appState && (
                <>
                  <div>
                    <label className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Default workspace
                      {appState.workspaces.length === 1 && (
                        <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>(Only one workspace available)</span>
                      )}
                    </label>
                    <select
                      value={defaultWorkspaceId ?? ''}
                      onChange={event => {
                        const newWorkspaceId = event.target.value || null;
                        setDefaultWorkspaceId(newWorkspaceId);
                        const boardsInWorkspace = appState.boards.filter(b => b.workspaceId === newWorkspaceId);
                        if (boardsInWorkspace.length === 1) {
                          setDefaultBoardId(boardsInWorkspace[0].id);
                        } else {
                          setDefaultBoardId(null);
                        }
                      }}
                      disabled={appState.workspaces.length === 1}
                      className="mt-2 w-full rounded-2xl border px-4 py-3"
                      style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    >
                      {appState.workspaces.length > 1 && <option value="">Select a workspace</option>}
                      {appState.workspaces
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(workspace => (
                          <option key={workspace.id} value={workspace.id}>
                            {workspace.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  {defaultWorkspaceId && (
                    <div>
                      <label className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Default board
                        {appState.boards.filter(b => b.workspaceId === defaultWorkspaceId).length === 1 && (
                          <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>(Only one board available)</span>
                        )}
                      </label>
                      <select
                        value={defaultBoardId ?? ''}
                        onChange={event => setDefaultBoardId(event.target.value || null)}
                        disabled={appState.boards.filter(b => b.workspaceId === defaultWorkspaceId).length === 1}
                        className="mt-2 w-full rounded-2xl border px-4 py-3"
                        style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      >
                        {appState.boards.filter(b => b.workspaceId === defaultWorkspaceId).length > 1 && <option value="">Select a board</option>}
                        {appState.boards
                          .filter(b => b.workspaceId === defaultWorkspaceId)
                          .sort((a, b) => a.title.localeCompare(b.title))
                          .map(board => (
                            <option key={board.id} value={board.id}>
                              {board.title}
                            </option>
                          ))}
                      </select>
                      {appState.boards.filter(b => b.workspaceId === defaultWorkspaceId).length === 0 && (
                        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>No boards in this workspace.</p>
                      )}
                    </div>
                  )}
                </>
              )}

              <fieldset>
                <legend className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Theme</legend>
                <div className="mt-3 space-y-3">
                  {([
                    { value: 'dark', label: 'Dark mode', description: 'Stronger contrast across dark surfaces while staying dark-first.' },
                    { value: 'light', label: 'Light mode', description: 'A brighter palette with the same hierarchy and controls.' },
                  ] as Array<{ value: ThemePreference; label: string; description: string }>).map(option => {
                    const selected = themePreference === option.value;
                    return (
                      <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3" style={{ background: selected ? 'var(--active-bg)' : 'var(--bg-secondary)', borderColor: selected ? 'var(--accent-hover)' : 'var(--border)' }}>
                        <input type="radio" name="theme-preference" value={option.value} checked={selected} onChange={() => setThemePreference(option.value)} className="mt-1" />
                        <span>
                          <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{option.label}</span>
                          <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{option.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={goBack} className="min-h-[44px] rounded-2xl border px-4 py-3 text-sm font-semibold" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
                <button type="button" onClick={() => { void handlePreferencesSave(); }} disabled={submitting} className="min-h-[44px] rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: 'var(--accent)', color: '#f8fbff' }}>
                  {submitting ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            </div>
          </>
        ) : null}

        {view === 'security' ? (
          <>
            {renderSubheader('Security', 'Confirm your current password before setting a new one.')}
            <div className="space-y-4 px-4 py-4 sm:px-5">
              {renderNotice()}

              <div className="rounded-2xl border p-4" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recovery key</p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Generate a new recovery key and keep it safe. You will need it if you ever have to recover access.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { void handleRecoveryKeyGenerate(); }}
                    disabled={submitting}
                    className="min-h-[44px] rounded-2xl px-4 py-3 text-sm font-semibold"
                    style={{ background: 'var(--accent)', color: '#f8fbff' }}
                  >
                    {submitting ? 'Generating...' : 'Generate Recovery Key'}
                  </button>
                </div>

                {recoveryKey ? (
                  <div className="mt-4 rounded-2xl border p-4" style={{ background: 'var(--modal-bg)', borderColor: 'var(--border)' }}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>New recovery key</p>
                    <p className="mt-2 text-sm" style={{ color: 'var(--text-primary)' }}>Keep this key safe. Anyone with this key can use it to recover your account.</p>
                    <code className="mt-3 block break-all rounded-xl border px-3 py-3 text-sm" style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                      {recoveryKey}
                    </code>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        aria-label="Close recovery key"
                        onClick={() => {
                          setRecoveryKey(null);
                          setCopiedRecoveryKey(false);
                        }}
                        className="min-h-[44px] rounded-2xl border px-4 py-3 text-sm font-semibold"
                        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(recoveryKey);
                          setCopiedRecoveryKey(true);
                        }}
                        className="min-h-[44px] rounded-2xl px-4 py-3 text-sm font-semibold"
                        style={{ background: copiedRecoveryKey ? 'var(--success)' : 'var(--accent)', color: '#f8fbff' }}
                      >
                        {copiedRecoveryKey ? 'Copied!' : 'Copy to clipboard'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <label className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Current password
                <input
                  aria-label="Current password"
                  type="password"
                  value={currentPassword}
                  onChange={event => setCurrentPassword(event.target.value)}
                  className="mt-2 w-full rounded-2xl border px-4 py-3"
                  style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </label>

              <label className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                New password
                <input
                  aria-label="New password"
                  type="password"
                  value={nextPassword}
                  onChange={event => setNextPassword(event.target.value)}
                  className="mt-2 w-full rounded-2xl border px-4 py-3"
                  style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </label>

              <label className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Confirm new password
                <input
                  aria-label="Confirm new password"
                  type="password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  className="mt-2 w-full rounded-2xl border px-4 py-3"
                  style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={goBack} className="min-h-[44px] rounded-2xl border px-4 py-3 text-sm font-semibold" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
                <button type="button" onClick={() => { void handleSecurityChange(); }} disabled={submitting} className="min-h-[44px] rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: 'var(--accent)', color: '#f8fbff' }}>
                  {submitting ? 'Changing...' : 'Change'}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
