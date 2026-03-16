import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { initialState } from './store';
import type { AdminDirectoryResponse } from './types';

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
            themePreference: 'dark',
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

  it('requires exact DELETE confirmation before removing a managed user', async () => {
    const directory: AdminDirectoryResponse = {
      users: [
        {
          id: 'u1',
          name: 'System Admin',
          initials: 'SA',
          color: '#6366f1',
          themePreference: 'dark',
          username: 'admin',
          platformRole: 'system_admin',
          mustChangePassword: false,
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          workspaceMemberships: [{ id: 'wm1', userId: 'u1', workspaceId: 'w1', role: 'workspace_admin', createdAt: new Date().toISOString() }],
          boardMemberships: [{ id: 'bm1', userId: 'u1', boardId: 'b1', role: 'board_admin', createdAt: new Date().toISOString() }],
        },
        {
          id: 'u2',
          name: 'Jordan Lee',
          initials: 'JL',
          color: '#2563eb',
          themePreference: 'dark',
          username: 'jordan',
          platformRole: 'user',
          mustChangePassword: false,
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          workspaceMemberships: [],
          boardMemberships: [],
        },
      ],
      workspaces: [{ id: 'w1', name: 'Acme Engineering' }],
      boards: [{ id: 'b1', title: 'Platform Sprint 24', workspaceId: 'w1' }],
      auditEvents: [],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);

      if (path.endsWith('/api/auth/session')) {
        return Response.json({
          status: 'authenticated',
          user: {
            id: 'u1',
            name: 'System Admin',
            initials: 'SA',
            color: '#6366f1',
            themePreference: 'dark',
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

      if (path.endsWith('/api/admin/users') && (!init?.method || init.method === 'GET')) {
        return Response.json(directory);
      }

      if (path.endsWith('/api/admin/users/u2') && init?.method === 'DELETE') {
        directory.users = directory.users.filter(user => user.id !== 'u2');
        return Response.json({ deletedUserId: 'u2', username: 'jordan', removedCardAssignments: 1, remediatedAutomationRules: 1 });
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

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Open admin panel' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'User Management' })).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Select user to edit'), 'u2');
    await user.click(screen.getByRole('button', { name: 'Delete User' }));
    expect(screen.getByText('User jordan will be removed from Strata. This cannot be undone. Are you sure?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Nevermind' }));
    expect(screen.queryByText('User jordan will be removed from Strata. This cannot be undone. Are you sure?')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete User' }));
    await user.click(screen.getByRole('button', { name: 'YES' }));

    const confirmationInput = screen.getByPlaceholderText('Type DELETE to confirm');
    const boomButton = screen.getByRole('button', { name: 'BOOM' });

    expect(boomButton).toBeDisabled();
    await user.type(confirmationInput, 'delete');
    expect(boomButton).toBeDisabled();
    await user.clear(confirmationInput);
    await user.type(confirmationInput, 'DELETE');
    expect(boomButton).toBeEnabled();

    await user.click(boomButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/users/u2', expect.objectContaining({ method: 'DELETE' }));
    });
    expect(screen.queryByRole('button', { name: 'BOOM' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'Jordan Lee (jordan)' })).not.toBeInTheDocument();
    });
  });
});
