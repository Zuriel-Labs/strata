import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { AcceptBoardInvitation } from './AcceptBoardInvitation';
import { BoardInvitations } from './BoardInvitations';
import * as invitations from '../services/invitations';
import { fetchEligibleBoardUsers } from '../services/admin';
const refresh = vi.fn().mockResolvedValue(undefined);
vi.mock('../lib/auth-context', () => ({ useAuth: () => ({ refresh, canManageBoard: () => true }) }));
vi.mock('../services/invitations', () => ({ acceptBoardInvitation: vi.fn(), createBoardInvitation: vi.fn(), fetchBoardInvitations: vi.fn(), revokeBoardInvitation: vi.fn() }));
vi.mock('../services/admin', () => ({ fetchEligibleBoardUsers: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it('accepts a code in memory, clears it and refreshes the recipient’s access', async () => {
  const user = userEvent.setup();
  vi.mocked(invitations.acceptBoardInvitation).mockResolvedValue({ boardId: 'b1', membershipRole: 'observer', alreadyAccepted: false });
  render(<AcceptBoardInvitation />);
  const code = `bi_${'a'.repeat(64)}`;
  await user.type(screen.getByLabelText('Invitation code'), code);
  await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(invitations.acceptBoardInvitation).toHaveBeenCalledWith(code);
  expect(screen.getByLabelText('Invitation code')).toHaveValue('');
  expect(screen.getByRole('status')).toHaveTextContent('Invitation accepted');
});

it('issues an existing account a scoped code once, clears it, and revokes pending metadata', async () => {
  const user = userEvent.setup();
  const page = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
  const invitation = { id: 'i1', boardId: 'b1', targetUserId: 'u2', role: 'observer' as const, expiresAt: '2026-10-18T12:00:00.000Z', status: 'pending' as const };
  vi.mocked(fetchEligibleBoardUsers).mockResolvedValue({ items: [{ id: 'u2', name: 'Alex', username: 'alex', initials: 'AL', color: '#abcdef' }], page });
  vi.mocked(invitations.fetchBoardInvitations).mockResolvedValue({ items: [invitation], page });
  const code = `bi_${'b'.repeat(64)}`;
  vi.mocked(invitations.createBoardInvitation).mockResolvedValue({ invitation, token: code });
  vi.mocked(invitations.revokeBoardInvitation).mockResolvedValue(undefined);
  render(<BoardInvitations boardId="b1" />);
  await user.selectOptions(await screen.findByLabelText('Invitation recipient'), 'u2');
  await user.selectOptions(screen.getByLabelText('Invitation role'), 'observer');
  await user.click(screen.getByRole('button', { name: 'Create invitation' }));
  await waitFor(() => expect(invitations.createBoardInvitation).toHaveBeenCalledWith('b1', 'u2', 'observer', expect.any(String)));
  expect(screen.getByLabelText('One-time board invitation code')).toHaveValue(code);
  await user.click(screen.getByRole('button', { name: 'Dismiss code' }));
  expect(screen.queryByLabelText('One-time board invitation code')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Revoke invitation for u2' }));
  await waitFor(() => expect(invitations.revokeBoardInvitation).toHaveBeenCalledWith('b1', 'i1'));
});
