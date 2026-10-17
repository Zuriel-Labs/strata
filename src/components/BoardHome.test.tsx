import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, initialState, useAppState } from '../store';
import { HomeNavigation } from './HomeNavigation';
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
  it('adds personal stars after server success without reading shared star values', async () => {
    const user = userEvent.setup();
    const board = initialState.boards[0];
    vi.mocked(navigation.setPersonalStar).mockResolvedValue({ boardId: board.id, starred: true });
    render(<AppProvider initialAppState={initialState}><BoardHome /></AppProvider>);
    await user.click(screen.getByRole('button', { name: 'All boards' }));
    await user.click(screen.getByRole('button', { name: `Add ${board.title} to your stars` }));
    expect(navigation.setPersonalStar).toHaveBeenCalledWith(board.id, true);
    expect(await screen.findByRole('button', { name: `Remove ${board.title} from your stars` })).toBeInTheDocument();
    expect(initialState.boards[0].starred).toBe(board.starred);
  });

  it('loads the next page while retaining previous recent boards', async () => {
    const user = userEvent.setup();
    const rows = initialState.boards.slice(0, 2).map(board => ({ boardId: board.id, workspaceId: board.workspaceId, title: board.title, color: board.color, starred: false, lastVisitedAt: '2026-10-01T00:00:00.000Z' }));
    vi.mocked(navigation.fetchNavigation).mockResolvedValueOnce({ items: [rows[0]], nextCursor: 'next' }).mockResolvedValueOnce({ items: [rows[1]], nextCursor: null });
    render(<AppProvider initialAppState={initialState}><BoardHome /></AppProvider>);
    await user.click(await screen.findByRole('button', { name: 'Load more boards' }));
    expect(await screen.findByRole('button', { name: `Open ${rows[1].title}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Open ${rows[0].title}` })).toBeInTheDocument();
    expect(navigation.fetchNavigation).toHaveBeenLastCalledWith('recent', 'next');
  });

  it('offers a named Home modal with keyboard focus return', async () => {
    const user = userEvent.setup();
    render(<AppProvider initialAppState={initialState}><HomeNavigation /></AppProvider>);
    const trigger = screen.getByRole('button', { name: 'Open Home' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Home' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

});
