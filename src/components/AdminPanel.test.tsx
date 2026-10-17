import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AdminPanel } from './AdminPanel';

vi.mock('../lib/auth-context', async () => {
  const { useState } = await import('react');
  return { useAuth: () => {
    const [adminOpen, setAdminOpen] = useState(true);
    return { adminOpen, setAdminOpen, session: { permissions: { isSystemAdmin: true } }, refresh: vi.fn() };
  } };
});
vi.mock('../services/admin', () => ({ fetchAdminDirectory: vi.fn().mockResolvedValue({ users: [], actorCapabilities: {}, page: { totalPages: 1 } }) }));

it('traps focus in Administration, closes on Escape and returns focus to its opener', async () => {
  const user = userEvent.setup();
  const opener = document.createElement('button'); opener.textContent = 'Administration opener'; document.body.append(opener); opener.focus();
  try {
    render(<AdminPanel />);
    const dialog = screen.getByRole('dialog', { name: 'Access & Membership' });
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  } finally { opener.remove(); }
});
