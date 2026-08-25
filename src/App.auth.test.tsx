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
      themePreference: 'dark',
      username: 'admin',
      platformRole: 'system_admin',
      mustChangePassword: false,
      defaultWorkspaceId: null,
      defaultBoardId: null,
    },
    permissions: {
      isSystemAdmin: true,
      workspaceAdminGrants: [],
      boardAdminGrants: [],
      boardMemberships: [
        { id: 'bm1', userId: 'u1', boardId: 'b1', role: 'member', createdAt: new Date().toISOString() },
      ],
      derivedWorkspaceIds: ['w1'],
    },
    appState: initialState,
  };
}

describe('App auth flows', () => {
  beforeEach(() => {
    let session = authenticatedSession();
    let authenticated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith('/api/auth/session')) {
        return authenticated ? Response.json(session) : new Response(null, { status: 401 });
      }
      if (path.endsWith('/api/auth/login') && init?.method === 'POST') {
        authenticated = true;
        return Response.json(session);
      }
      if (path.endsWith('/api/auth/profile') && init?.method === 'PATCH') {
        const payload = JSON.parse(String(init.body)) as { name: string; initials: string; color: string };
        session = {
          ...session,
          user: {
            ...session.user,
            name: payload.name,
            initials: payload.initials,
            color: payload.color,
          },
        };
        return Response.json({ user: session.user });
      }
      if (path.endsWith('/api/auth/preferences') && init?.method === 'PATCH') {
        const payload = JSON.parse(String(init.body)) as { themePreference: 'dark' | 'light' };
        session = {
          ...session,
          user: {
            ...session.user,
            themePreference: payload.themePreference,
          },
        };
        return Response.json({ user: session.user });
      }
      if (path.endsWith('/api/auth/password/change') && init?.method === 'POST') {
        return new Response(null, { status: 204 });
      }
      if (path.endsWith('/api/auth/recovery-key/generate') && init?.method === 'POST') {
        return Response.json({ recoveryKey: 'recovery-key-123456' });
      }
      if (path.endsWith('/api/auth/logout') && init?.method === 'POST') {
        authenticated = false;
        return new Response(null, { status: 204 });
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
      expect(screen.getByText('Platform Sprint 24')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Open admin panel' })).toBeInTheDocument();
  });

  it('supports profile, preferences, security, and sign-out flows from the account menu', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Platform Sprint 24')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Open profile menu' }));
    expect(screen.getByRole('button', { name: /^Profile/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Preferences/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Security/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sign Out/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Profile/ }));
    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Admin Prime');
    await user.clear(screen.getByLabelText('Initials'));
    await user.type(screen.getByLabelText('Initials'), 'AP');
    await user.click(screen.getByRole('button', { name: 'Save Profile' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open profile menu' })).toHaveTextContent('AP');
    });

    await user.click(screen.getByRole('button', { name: 'Back to account menu' }));
    await user.click(screen.getByRole('button', { name: /^Preferences/ }));
    await user.click(screen.getByRole('radio', { name: /Light mode/ }));
    await user.click(screen.getByRole('button', { name: 'Save Preferences' }));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light');
    });

    await user.click(screen.getByRole('button', { name: 'Back to account menu' }));
    await user.click(screen.getByRole('button', { name: /^Security/ }));
    await user.click(screen.getByRole('button', { name: 'Generate Recovery Key' }));
    expect(await screen.findByText('Keep this key safe. Anyone with this key can use it to recover your account.')).toBeInTheDocument();
    expect(screen.getByText('recovery-key-123456')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close recovery key' }));
    expect(screen.queryByText('recovery-key-123456')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Current password'), 'CurrentPassword123!');
    await user.type(screen.getByLabelText('New password'), 'PasswordChange123!');
    await user.type(screen.getByLabelText('Confirm new password'), 'PasswordChange123?');
    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByText('New passwords do not match.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: /^Sign Out/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    });
  });
});
