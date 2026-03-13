import type { PasswordChangeRequiredPayload, SessionPayload, SessionResponse } from '../types';
import { apiRequest } from './api';

export function fetchSession() {
  return apiRequest<SessionResponse>('/api/auth/session', { method: 'GET' });
}

export function login(email: string, password: string) {
  return apiRequest<SessionResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return apiRequest<void>('/api/auth/logout', { method: 'POST' });
}

export function changePassword(currentPassword: string, nextPassword: string) {
  return apiRequest<void>('/api/auth/password/change', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, nextPassword }),
  });
}

export function isAuthenticatedSession(payload: SessionResponse | null): payload is SessionPayload {
  return Boolean(payload && payload.status === 'authenticated');
}

export function isPasswordChangeRequired(payload: SessionResponse | null): payload is PasswordChangeRequiredPayload {
  return Boolean(payload && payload.status === 'password-change-required');
}
