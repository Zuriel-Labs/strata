import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth-context';
import { initialState } from '../store';
import type { SessionPayload } from '../types';
import * as sessionApi from '../services/session';
import { ApiError } from '../services/api';

const payload: SessionPayload = {
  status: 'authenticated',
  user: { id: 'u3', name: 'Member', initials: 'M', color: '#123456', username: 'member', platformRole: 'user', mustChangePassword: false, themePreference: 'dark', defaultWorkspaceId: null, defaultBoardId: null },
  permissions: { isSystemAdmin: false, workspaceAdminGrants: [], boardAdminGrants: [], boardMemberships: [], derivedWorkspaceIds: [] },
  appState: initialState,
};
afterEach(() => vi.restoreAllMocks());

it('preserves the signed-in shell on transport failure and clears it on confirmed 401', async () => {
  const fetch = vi.spyOn(sessionApi, 'fetchSession').mockResolvedValue(payload);
  vi.spyOn(sessionApi, 'checkBootstrap').mockResolvedValue({ needsBootstrap: false });
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(result.current.status).toBe('authenticated'));
  fetch.mockRejectedValueOnce(new TypeError('Network unavailable'));
  await act(() => result.current.refresh());
  expect(result.current.status).toBe('authenticated');
  expect(result.current.session).toEqual(payload);
  expect(result.current.error).toBe('Network unavailable');
  fetch.mockRejectedValueOnce(new ApiError(401, 'No active session.'));
  await act(() => result.current.refresh());
  expect(result.current.status).toBe('anonymous');
  expect(result.current.session).toBeNull();
});
