import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SessionPayload, SessionResponse } from '../types';
import { ApiError } from '../services/api';
import { changePassword, checkBootstrap, fetchSession, isAuthenticatedSession, isPasswordChangeRequired, login as loginRequest, logout as logoutRequest, submitBootstrap as submitBootstrapRequest } from '../services/session';

type AuthStatus = 'loading' | 'needs-bootstrap' | 'anonymous' | 'password-change-required' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  session: SessionPayload | null;
  pendingSession: SessionResponse | null;
  error: string | null;
  adminOpen: boolean;
  accessDenied: string | null;
  appKey: number;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  changePassword: (currentPassword: string, nextPassword: string, confirmPassword: string) => Promise<void>;
  bootstrap: (username: string, password: string, confirmPassword: string) => Promise<void>;
  setAdminOpen: (open: boolean) => void;
  setAccessDenied: (message: string | null) => void;
  canManageWorkspace: (workspaceId: string | null) => boolean;
  canManageBoard: (boardId: string | null) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [pendingSession, setPendingSession] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [appKey, setAppKey] = useState(0);

  const handleSession = useCallback((payload: SessionResponse | null) => {
    setPendingSession(payload);
    if (isAuthenticatedSession(payload)) {
      setSession(payload);
      setStatus('authenticated');
      setAppKey(value => value + 1);
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
    try {
      const payload = await fetchSession();
      setError(null);
      handleSession(payload);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setError(null);
        try {
          const bootstrapCheck = await checkBootstrap();
          if (bootstrapCheck.needsBootstrap) {
            setStatus('needs-bootstrap');
            return;
          }
        } catch {
          // If bootstrap check fails, fall through to anonymous
        }
        handleSession(null);
        return;
      }
      setError(requestError instanceof Error ? requestError.message : 'Unable to restore session.');
      handleSession(null);
    }
  }, [handleSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const payload = await loginRequest(username, password);
    setError(null);
    handleSession(payload);
  }, [handleSession]);

  const bootstrapFn = useCallback(async (username: string, password: string, confirmPassword: string) => {
    const payload = await submitBootstrapRequest(username, password, confirmPassword);
    setError(null);
    handleSession(payload);
  }, [handleSession]);

  const logout = useCallback(async () => {
    await logoutRequest();
    setAdminOpen(false);
    handleSession(null);
  }, [handleSession]);

  const updatePassword = useCallback(async (currentPassword: string, nextPassword: string, confirmPassword: string) => {
    await changePassword(currentPassword, nextPassword, confirmPassword);
    await refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    session,
    pendingSession,
    error,
    adminOpen,
    accessDenied,
    appKey,
    login,
    logout,
    refresh,
    changePassword: updatePassword,
    bootstrap: bootstrapFn,
    setAdminOpen,
    setAccessDenied,
    canManageWorkspace: workspaceId => {
      if (!workspaceId || !session) return false;
      return session.permissions.isSystemAdmin || session.permissions.workspaceMemberships.some(membership => membership.workspaceId === workspaceId && membership.role === 'workspace_admin');
    },
    canManageBoard: boardId => {
      if (!boardId || !session) return false;
      if (session.permissions.isSystemAdmin || session.permissions.boardMemberships.some(membership => membership.boardId === boardId && membership.role === 'board_admin')) {
        return true;
      }
      const board = session.appState.boards.find(candidate => candidate.id === boardId);
      return board ? session.permissions.workspaceMemberships.some(membership => membership.workspaceId === board.workspaceId && membership.role === 'workspace_admin') : false;
    },
  }), [accessDenied, adminOpen, appKey, bootstrapFn, error, login, logout, pendingSession, refresh, session, status, updatePassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
