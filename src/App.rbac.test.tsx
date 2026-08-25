import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { initialState } from './store';

describe('App RBAC views', () => {
  beforeEach(() => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/api/auth/session')) {
        return Response.json({
          status: 'authenticated',
          user: {
            id: 'u3',
            name: 'Priya Sharma',
            initials: 'PS',
            color: '#c026d3',
            themePreference: 'dark',
            username: 'priya',
            platformRole: 'user',
            mustChangePassword: false,
          },
          permissions: {
            isSystemAdmin: false,
            workspaceAdminGrants: [],
            boardAdminGrants: [],
            boardMemberships: [{ id: 'bm3', userId: 'u3', boardId: 'b1', role: 'member', createdAt: new Date().toISOString() }],
            derivedWorkspaceIds: ['w1'],
          },
          appState: initialState,
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('hides admin and board-management affordances for non-admin roles', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Platform Sprint 24')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Open admin panel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add another list/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage board labels' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument();
  });
});
