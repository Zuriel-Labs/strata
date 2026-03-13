import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { initialState } from './store';
import type { SessionPayload } from './types';

function authenticatedSession(): SessionPayload {
  return {
    status: 'authenticated',
    user: {
      id: 'u1',
      name: 'System Admin',
      initials: 'SA',
      color: '#6366f1',
      email: 'admin@strata.local',
      platformRole: 'system_admin',
      mustChangePassword: false,
    },
    permissions: {
      isSystemAdmin: true,
      workspaceMemberships: [
        { id: 'wm1', userId: 'u1', workspaceId: 'w1', role: 'workspace_admin', createdAt: new Date().toISOString() },
      ],
      boardMemberships: [
        { id: 'bm1', userId: 'u1', boardId: 'b1', role: 'board_admin', createdAt: new Date().toISOString() },
      ],
    },
    appState: initialState,
  };
}

describe('App auth flows', () => {
  beforeEach(() => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith('/api/auth/session')) {
        return new Response(null, { status: 401 });
      }
      if (path.endsWith('/api/auth/login') && init?.method === 'POST') {
        return Response.json(authenticatedSession());
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('renders login and signs in to the protected shell', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Platform Sprint 24' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Open admin panel' })).toBeInTheDocument();
  });
});
