import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { initialState } from './store';

describe('App admin flows', () => {
  beforeEach(() => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/api/auth/session')) {
        return Response.json({
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
            workspaceMemberships: [{ id: 'wm1', userId: 'u1', workspaceId: 'w1', role: 'workspace_admin', createdAt: new Date().toISOString() }],
            boardMemberships: [{ id: 'bm1', userId: 'u1', boardId: 'b1', role: 'board_admin', createdAt: new Date().toISOString() }],
          },
          appState: initialState,
        });
      }
      if (path.endsWith('/api/admin/users')) {
        return Response.json({
          users: [],
          workspaces: [{ id: 'w1', name: 'Acme Engineering' }],
          boards: [{ id: 'b1', title: 'Platform Sprint 24', workspaceId: 'w1' }],
          auditEvents: [],
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('opens the admin panel for system admins', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Open admin panel' }));

    await waitFor(() => {
      expect(screen.getByText('Recent audit events')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Create user' })).toBeInTheDocument();
  });
});
