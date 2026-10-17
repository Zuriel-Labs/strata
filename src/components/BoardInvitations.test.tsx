import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { AcceptBoardInvitation } from './AcceptBoardInvitation';
import * as invitations from '../services/invitations';
const refresh = vi.fn().mockResolvedValue(undefined);
vi.mock('../lib/auth-context', () => ({ useAuth: () => ({ refresh, canManageBoard: () => true }) }));
vi.mock('../services/invitations', () => ({ acceptBoardInvitation: vi.fn(), createBoardInvitation: vi.fn(), fetchBoardInvitations: vi.fn(), revokeBoardInvitation: vi.fn() }));
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
