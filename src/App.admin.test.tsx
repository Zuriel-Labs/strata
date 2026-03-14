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
            username: 'admin',
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
      if (path.endsWith('/api/boards/b1/labels')) {
        return Response.json({
          boardId: 'b1',
          labels: initialState.boards.find(board => board.id === 'b1')?.labels ?? [],
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('opens the admin panel for system admins', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('button', { name: 'Manage board labels' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Manage board labels' }));
    expect(screen.getByRole('heading', { name: 'Board labels' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close label manager' }));

    await user.click(await screen.findByRole('button', { name: 'Open admin panel' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'User Management' })).toBeInTheDocument();
    });
    expect(screen.getByText('Edit Users')).toBeInTheDocument();
    expect(screen.getByText('Create User')).toBeInTheDocument();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
  });
});
