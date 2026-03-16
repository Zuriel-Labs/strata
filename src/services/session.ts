import type { PasswordChangeRequiredPayload, SessionPayload, SessionResponse, SessionUser, ThemePreference } from '../types';
import { apiRequest } from './api';

export function fetchSession() {
  return apiRequest<SessionResponse>('/api/auth/session', { method: 'GET' });
}

export function checkBootstrap() {
  return apiRequest<{ needsBootstrap: boolean }>('/api/auth/needs-bootstrap', { method: 'GET' });
}

export function submitBootstrap(username: string, password: string, confirmPassword: string) {
  return apiRequest<SessionResponse>('/api/auth/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ username, password, confirmPassword }),
  });
}

export function login(username: string, password: string) {
  return apiRequest<SessionResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function logout() {
  return apiRequest<void>('/api/auth/logout', { method: 'POST' });
}

export function changePassword(currentPassword: string, nextPassword: string, confirmPassword: string) {
  return apiRequest<void>('/api/auth/password/change', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, nextPassword, confirmPassword }),
  });
}

export function updateProfile(name: string, initials: string, color: string) {
  return apiRequest<{ user: SessionUser }>('/api/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify({ name, initials, color }),
  });
}

export function updatePreferences(themePreference: ThemePreference) {
  return apiRequest<{ user: SessionUser }>('/api/auth/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ themePreference }),
  });
}

export function generateRecoveryKey() {
  return apiRequest<{ recoveryKey: string }>('/api/auth/recovery-key/generate', { method: 'POST' });
}

export function consumeRecoveryKey(username: string, recoveryKey: string, newPassword: string, confirmPassword: string) {
  return apiRequest<{ newRecoveryKey: string }>('/api/auth/recovery-key/consume', {
    method: 'POST',
    body: JSON.stringify({ username, recoveryKey, newPassword, confirmPassword }),
  });
}

export function isAuthenticatedSession(payload: SessionResponse | null): payload is SessionPayload {
  return Boolean(payload && payload.status === 'authenticated');
}

export function isPasswordChangeRequired(payload: SessionResponse | null): payload is PasswordChangeRequiredPayload {
  return Boolean(payload && payload.status === 'password-change-required');
}
