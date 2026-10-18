import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SessionPayload, SessionResponse, ThemePreference } from '../types';
import { ApiError } from '../services/api';
import { changePassword, checkBootstrap, fetchSession, isAuthenticatedSession, isPasswordChangeRequired, login as loginRequest, logout as logoutRequest, submitBootstrap as submitBootstrapRequest, updatePreferences as updatePreferencesRequest, updateProfile as updateProfileRequest } from '../services/session';

type AuthStatus = 'loading' | 'needs-bootstrap' | 'anonymous' | 'password-change-required' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  session: SessionPayload | null;
  pendingSession: SessionResponse | null;
  error: string | null;
  adminOpen: boolean;
  accessDenied: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (name: string, initials: string, color: string) => Promise<void>;
  updatePreferences: (themePreference: ThemePreference, defaultWorkspaceId?: string | null, defaultBoardId?: string | null) => Promise<void>;
  changePassword: (currentPassword: string, nextPassword: string, confirmPassword: string) => Promise<void>;
  bootstrap: (username: string, password: string, confirmPassword: string) => Promise<void>;
  setAdminOpen: (open: boolean) => void;
  setAccessDenied: (message: string | null) => void;
  canManageWorkspace: (workspaceId: string | null) => boolean;
  canManageBoard: (boardId: string | null) => boolean;
  canManageAutomation: (boardId: string | null) => boolean;
  canManageBoardLabels: (boardId: string | null) => boolean;
  canArchiveBoardContent: (boardId: string | null) => boolean;
  canEditBoardCards: (boardId: string | null) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTO_REFRESH_INTERVAL_MS = 5000;

export function canManageWorkspaceForSession(session: SessionPayload | null, workspaceId: string | null) {
  if (!workspaceId || !session) return false;
  return session.permissions.isSystemAdmin || (session.permissions.workspaceAdminGrants ?? []).some(grant => grant.workspaceId === workspaceId);
}

export function canManageBoardForSession(session: SessionPayload | null, boardId: string | null) {
  if (!boardId || !session) return false;
  if (session.permissions.isSystemAdmin || (session.permissions.boardAdminGrants ?? []).some(grant => grant.boardId === boardId)) return true;
  const board = session.appState.boards.find(candidate => candidate.id === boardId);
  return board ? (session.permissions.workspaceAdminGrants ?? []).some(grant => grant.workspaceId === board.workspaceId) : false;
}

export function isBoardActiveForSession(session: SessionPayload | null, boardId: string | null) {
  const board = session?.appState.boards.find(candidate => candidate.id === boardId);
  return Boolean(board && board.lifecycleState !== 'closed' && session?.appState.workspaces.find(workspace => workspace.id === board.workspaceId)?.lifecycleState !== 'closed');
}

export function canEditBoardCardsForSession(session: SessionPayload | null, boardId: string | null) {
  if (!boardId || !session) return false;
  if (!isBoardActiveForSession(session, boardId)) return false;
  const board = session.appState.boards.find(candidate => candidate.id === boardId);
  return canManageBoardForSession(session, boardId)
    || (!board?.isTemplate && session.permissions.boardMemberships.some(membership => membership.boardId === boardId && membership.role === 'member'));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [pendingSession, setPendingSession] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const sessionFingerprint = useRef<string | null | undefined>(undefined);
  const refreshRequestId = useRef(0);

  const handleSession = useCallback((payload: SessionResponse | null) => {
    const fingerprint = payload ? JSON.stringify(payload) : null;
    if (sessionFingerprint.current === fingerprint) return;
    sessionFingerprint.current = fingerprint;
    setPendingSession(payload);
    if (isAuthenticatedSession(payload)) {
      setSession(payload);
      setStatus('authenticated');
      return;
    }
    setSession(null);
    if (isPasswordChangeRequired(payload)) {
      setStatus('password-change-required');
      return;
    }
    setStatus('anonymous');
  }, []);

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestId.current;
    try {
      const payload = await fetchSession();
      if (requestId !== refreshRequestId.current) return;
      setError(null);
      handleSession(payload);
    } catch (requestError) {
      if (requestId !== refreshRequestId.current) return;
      if (requestError instanceof ApiError && requestError.status === 401) {
        setError(null);
        setAdminOpen(false);
        setAccessDenied(null);
        handleSession(null);
        try {
          const bootstrapCheck = await checkBootstrap();
          if (bootstrapCheck.needsBootstrap) {
            setStatus('needs-bootstrap');
            return;
          }
        } catch {
          // If bootstrap check fails, fall through to anonymous
        }
        return;
      }
      setError(requestError instanceof Error ? requestError.message : 'Unable to restore session.');
      setStatus(current => current === 'loading' ? 'anonymous' : current);
    }
  }, [handleSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const refreshIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refresh();
    };

    const timer = window.setInterval(refreshIfVisible, AUTO_REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => refreshIfVisible();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refresh, status]);

  const login = useCallback(async (username: string, password: string) => {
    refreshRequestId.current += 1;
    const payload = await loginRequest(username, password);
    setError(null);
    handleSession(payload);
  }, [handleSession]);

  const bootstrapFn = useCallback(async (username: string, password: string, confirmPassword: string) => {
    refreshRequestId.current += 1;
    const payload = await submitBootstrapRequest(username, password, confirmPassword);
    setError(null);
    handleSession(payload);
  }, [handleSession]);

  const logout = useCallback(async () => {
    refreshRequestId.current += 1;
    await logoutRequest();
    setAdminOpen(false);
    handleSession(null);
  }, [handleSession]);

  const updatePassword = useCallback(async (currentPassword: string, nextPassword: string, confirmPassword: string) => {
    await changePassword(currentPassword, nextPassword, confirmPassword);
    await refresh();
  }, [refresh]);

  const updateProfile = useCallback(async (name: string, initials: string, color: string) => {
    await updateProfileRequest(name, initials, color);
    await refresh();
  }, [refresh]);

  const updatePreferences = useCallback(async (themePreference: ThemePreference, defaultWorkspaceId?: string | null, defaultBoardId?: string | null) => {
    await updatePreferencesRequest(themePreference, defaultWorkspaceId, defaultBoardId);
    await refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    session,
    pendingSession,
    error,
    adminOpen,
    accessDenied,
    login,
    logout,
    refresh,
    updateProfile,
    updatePreferences,
    changePassword: updatePassword,
    bootstrap: bootstrapFn,
    setAdminOpen,
    setAccessDenied,
    canManageWorkspace: workspaceId => canManageWorkspaceForSession(session, workspaceId),
    canManageBoard: boardId => canManageBoardForSession(session, boardId),
    canManageAutomation: boardId => isBoardActiveForSession(session, boardId) && canManageBoardForSession(session, boardId),
    canManageBoardLabels: boardId => isBoardActiveForSession(session, boardId) && canManageBoardForSession(session, boardId),
    canArchiveBoardContent: boardId => isBoardActiveForSession(session, boardId) && canManageBoardForSession(session, boardId),
    canEditBoardCards: boardId => canEditBoardCardsForSession(session, boardId),
  }), [accessDenied, adminOpen, bootstrapFn, error, login, logout, pendingSession, refresh, session, status, updatePassword, updatePreferences, updateProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
