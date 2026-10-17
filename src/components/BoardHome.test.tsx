import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, initialState, useAppState } from '../store';
import { BoardHome } from './BoardHome';
import * as navigation from '../services/navigation';

const refresh = vi.fn().mockResolvedValue(undefined);
vi.mock('../lib/auth-context', () => ({ useAuth: () => ({ refresh }) }));
vi.mock('../services/navigation', () => ({ fetchNavigation: vi.fn(), visitBoard: vi.fn(), setPersonalStar: vi.fn() }));
function Harness() { const state = useAppState(); return <><BoardHome /><output>{state.currentBoardId ?? 'No board'}</output></>; }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(navigation.fetchNavigation).mockResolvedValue({ items: [], nextCursor: null }); vi.mocked(navigation.visitBoard).mockResolvedValue(undefined); });

describe('Home navigation for every role', () => {
  it('distinguishes no history and lets a member open an accessible board without Management', async () => {
    render(<AppProvider initialAppState={{ ...initialState, currentBoardId: null }}><Harness /></AppProvider>);
    expect(await screen.findByText('No recent boards yet.')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'All boards' }));
    const board = initialState.boards[0];
    await user.click(screen.getByRole('button', { name: `Open ${board.title}` }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(board.id));
    expect(navigation.visitBoard).toHaveBeenCalledWith(board.id);
    expect(screen.queryByText('Management')).not.toBeInTheDocument();
  });
});
