import { useEffect, useState } from 'react';
import './App.css';
import { AppProvider, useAppState } from './store';
import { BoardHome } from './components/BoardHome';
import { visitBoard } from './services/navigation';
import { ApiError } from './services/api';
import { Header } from './components/Header';
import { BoardView, TableView, CalendarView } from './components/BoardView';
import { CardModal } from './components/CardModal';
import { SearchOverlay } from './components/SearchOverlay';
import { AdminPanel } from './components/AdminPanel';
import { AccessDenied } from './components/AccessDenied';
import { AuthScreen } from './components/AuthScreen';
import { AuthProvider, useAuth } from './lib/auth-context';
import { consumeRecoveryKey } from './services/session';
import { Toaster } from './components/ui/toaster';

function AppInner() {
  const state = useAppState();
  const auth = useAuth();
  const board = state.boards.find(b => b.id === state.currentBoardId);
  const themePreference = auth.session?.user.themePreference ?? 'dark';
  const [visitError, setVisitError] = useState<string | null>(null);
  const boardId = board?.id;
  const refresh = auth.refresh;
  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    void visitBoard(boardId).then(() => { if (!cancelled) setVisitError(null); }).catch(async failure => {
      if (cancelled) return;
      setVisitError('Unable to update recent boards. Open Home to retry.');
      if (failure instanceof ApiError && [401, 404].includes(failure.status)) await refresh();
    });
    return () => { cancelled = true; };
  }, [boardId, refresh]);

  useEffect(() => {
    document.documentElement.dataset.theme = themePreference;
  }, [themePreference]);

  return (
    <div className="h-screen w-screen flex overflow-hidden" data-theme={themePreference} style={{ background: 'var(--bg)', color: 'var(--text-primary)', fontFamily: 'var(--font)' }}>
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
        {auth.error && <div role="alert" className="px-4 py-2 text-sm flex items-center gap-3" style={{ background: 'var(--bg-secondary)' }}>
          <span>Connection interrupted. Content may be out of date.</span>
          <button className="underline shrink-0 focus-visible:outline focus-visible:outline-2" onClick={() => void auth.refresh()}>Retry connection</button>
        </div>}
        {visitError && <p role="status" className="px-4 py-1 text-sm">{visitError}</p>}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            {!board ? (
              <div className="flex-1 overflow-y-auto"><BoardHome /></div>
            ) : state.viewMode === 'board' ? (
              <BoardView />
            ) : state.viewMode === 'table' ? (
              <TableView />
            ) : (
              <CalendarView />
            )}
          </div>
        </div>
      </div>
      {state.activeCardId && <CardModal key={state.activeCardId} />}
      <SearchOverlay />
      <AdminPanel />
      <AccessDenied />
      <Toaster />
    </div>
  );
}

function parseInviteFromUrl(): { username: string; token: string } | null {
  const match = window.location.pathname.match(/^\/invite\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return { username: decodeURIComponent(match[1]), token: match[2] };
}

function clearInviteUrl() {
  if (window.location.pathname.startsWith('/invite/')) {
    window.history.replaceState(null, '', '/');
  }
}

function AppShell() {
  const auth = useAuth();
  const [invite] = useState(() => parseInviteFromUrl());
  const [showRecovery, setShowRecovery] = useState(!!invite);
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);

  if (auth.status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>Loading Strata...</div>;
  }

  if (auth.status === 'needs-bootstrap') {
    return (
      <AuthScreen
        mode="bootstrap"
        title="Welcome to Strata"
        subtitle="Create the first admin account to get started."
        error={auth.error}
        onBootstrap={async (username, password, confirmPassword) => {
          await auth.bootstrap(username, password, confirmPassword);
        }}
      />
    );
  }

  if (auth.status === 'anonymous') {
    if (showRecovery) {
      return (
        <AuthScreen
          mode="recovery"
          title={newRecoveryKey ? 'Password reset successful' : invite ? `Welcome to Strata, ${invite.username}` : 'Reset your password'}
          subtitle={newRecoveryKey ? 'Your password has been changed. Save your new recovery key below — you will need it next time.' : invite ? 'Set your password to activate your account.' : 'Enter your username, recovery key, and a new password.'}
          error={auth.error}
          newRecoveryKey={newRecoveryKey}
          initialUsername={invite?.username}
          initialRecoveryKey={invite?.token}
          onRecovery={async (username, recoveryKey, newPassword, confirmPassword) => {
            const result = await consumeRecoveryKey(username, recoveryKey, newPassword, confirmPassword);
            setNewRecoveryKey(result.newRecoveryKey);
          }}
          onSwitchToLogin={() => { setShowRecovery(false); setNewRecoveryKey(null); clearInviteUrl(); }}
        />
      );
    }

    return (
      <AuthScreen
        mode="login"
        title="Sign in to Strata"
        subtitle="Server-backed sessions, scoped RBAC, and admin-managed access now protect every workspace."
        error={auth.error}
        onLogin={async (username, password) => {
          await auth.login(username, password);
        }}
        onSwitchToRecovery={() => setShowRecovery(true)}
      />
    );
  }

  if (auth.status === 'password-change-required') {
    return (
      <AuthScreen
        mode="password-change"
        title="Rotate your temporary password"
        subtitle="This account is in a forced password change state before platform access is granted."
        error={auth.error}
        onChangePassword={async (currentPassword, nextPassword, confirmPassword) => {
          await auth.changePassword(currentPassword, nextPassword, confirmPassword);
        }}
      />
    );
  }

  return (
    <AppProvider initialAppState={auth.session?.appState}>
      <AppInner />
    </AppProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
