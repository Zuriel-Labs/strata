import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ProfileOverlay } from './ProfileOverlay';
import { initialState } from '../store';

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    session: {
      user: { id: 'u1', name: 'Test User', username: 'test-user', initials: 'TU', color: '#315ddc', themePreference: 'dark', defaultWorkspaceId: null, defaultBoardId: null },
      appState: initialState,
    },
  }),
}));

function Account() {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Open account</button>
    <button>Outside action</button>
    <ProfileOverlay open={open} onClose={() => setOpen(false)} />
  </>;
}

describe('account keyboard and focus', () => {
  it('traps focus and restores the opener after closing', async () => {
    const user = userEvent.setup();
    render(<Account />);
    const trigger = screen.getByRole('button', { name: 'Open account' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Account menu' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let index = 0; index < 8; index++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('moves focus into a subview and back to its account action', async () => {
    const user = userEvent.setup();
    render(<Account />);
    await user.click(screen.getByRole('button', { name: 'Open account' }));
    await user.click(screen.getByRole('button', { name: /^Preferences/ }));
    expect(screen.getByRole('button', { name: 'Back to account menu' })).toHaveFocus();
    await user.keyboard('{Escape}');
    const dialog = screen.getByRole('dialog', { name: 'Account menu' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /^Preferences/ })).toHaveFocus());
    await user.click(within(dialog).getByRole('button', { name: 'Close account menu' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open account' })).toHaveFocus());
  });
});
