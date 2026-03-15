import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardView } from './BoardView';
import { AppProvider, initialState } from '../store';
import type { List } from '../types';

const { createListApiMock } = vi.hoisted(() => ({
  createListApiMock: vi.fn(),
}));

vi.mock('../services/data', async () => {
  const actual = await vi.importActual<typeof import('../services/data')>('../services/data');
  return {
    ...actual,
    createListApi: createListApiMock,
  };
});

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    canManageBoard: () => true,
    canManageBoardLabels: () => true,
    canEditBoardCards: () => true,
    canArchiveBoardContent: () => true,
  }),
}));

describe('BoardView', () => {
  beforeEach(() => {
    createListApiMock.mockReset();
  });

  it('shows the simplified add-card input', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider initialAppState={initialState}>
        <BoardView />
      </AppProvider>,
    );

    await user.click(screen.getAllByRole('button', { name: /add a card/i })[0]);
    expect(screen.getByPlaceholderText('Card title…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });

  it('shows the simplified add-list input', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider initialAppState={initialState}>
        <BoardView />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: /add another list/i }));
    expect(screen.getByPlaceholderText('List title…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });

  it('submits a new list when the input blurs', async () => {
    const user = userEvent.setup();
    const newList: List = {
      id: 'list-new',
      title: 'Roadmap',
      boardId: 'b1',
      position: 99,
      archived: false,
    };
    createListApiMock.mockResolvedValue(newList);

    render(
      <AppProvider initialAppState={initialState}>
        <BoardView />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: /add another list/i }));
    await user.type(screen.getByPlaceholderText('List title…'), 'Roadmap');
    await user.click(document.body);

    await waitFor(() => {
      expect(createListApiMock).toHaveBeenCalledWith({ boardId: 'b1', title: 'Roadmap' });
    });
    expect(screen.queryByPlaceholderText('List title…')).not.toBeInTheDocument();
  });
});
