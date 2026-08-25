import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardView } from './BoardView';
import { AppProvider, initialState } from '../store';
import type { List } from '../types';

const { createListApiMock, moveCardApiMock, sortListApiMock, canEditCardsMock, canArchiveMock } = vi.hoisted(() => ({
  createListApiMock: vi.fn(),
  moveCardApiMock: vi.fn(),
  sortListApiMock: vi.fn(),
  canEditCardsMock: vi.fn(() => true),
  canArchiveMock: vi.fn(() => true),
}));

vi.mock('../services/data', async () => {
  const actual = await vi.importActual<typeof import('../services/data')>('../services/data');
  return {
    ...actual,
    createListApi: createListApiMock,
    moveCardApi: moveCardApiMock,
    sortListApi: sortListApiMock,
  };
});

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    canManageBoard: () => true,
    canManageBoardLabels: () => true,
    canEditBoardCards: canEditCardsMock,
    canArchiveBoardContent: canArchiveMock,
  }),
}));

function mockCardLayout() {
  const cardTops: Record<string, number> = { c5: 0, c6: 110 };
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const cardElement = this.closest('[data-card-id]') as HTMLElement | null;
    const top = cardElement ? cardTops[cardElement.dataset.cardId ?? ''] ?? 0 : 0;
    return { x: 0, y: top, top, left: 0, right: 280, bottom: top + 100, width: 280, height: 100, toJSON: () => ({}) } as DOMRect;
  });
}

describe('BoardView', () => {
  beforeEach(() => {
    createListApiMock.mockReset();
    moveCardApiMock.mockReset();
    sortListApiMock.mockReset();
    canEditCardsMock.mockReturnValue(true);
    canArchiveMock.mockReturnValue(true);
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

  it('provides named keyboard drag handles without native draggable cards', () => {
    render(
      <AppProvider initialAppState={initialState}>
        <BoardView />
      </AppProvider>,
    );

    const handle = screen.getByRole('button', { name: 'Drag Migrate to Node 20 LTS' });
    expect(handle).toHaveAttribute('aria-describedby', 'card-drag-instructions');
    expect(screen.getByText('Migrate to Node 20 LTS').closest('[data-card-id="c6"]')).not.toHaveAttribute('draggable');
  });

  it('keeps cards readable but removes reorder controls for read-only users', () => {
    canEditCardsMock.mockReturnValue(false);

    render(
      <AppProvider initialAppState={initialState}>
        <BoardView />
      </AppProvider>,
    );

    expect(screen.getByText('Migrate to Node 20 LTS')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Drag Migrate to Node 20 LTS' })).not.toBeInTheDocument();
    expect(screen.getByText('Migrate to Node 20 LTS').closest('[data-card-id="c6"]')).not.toHaveAttribute('aria-disabled');
  });

  it('persists one keyboard reorder through the authoritative move endpoint', async () => {
    const user = userEvent.setup();
    const movingCard = initialState.cards.find(card => card.id === 'c6')!;
    moveCardApiMock.mockResolvedValue({ ...movingCard, position: 0 });
    mockCardLayout();
    render(
      <AppProvider initialAppState={initialState}>
        <BoardView />
      </AppProvider>,
    );

    const handle = screen.getByRole('button', { name: 'Drag Migrate to Node 20 LTS' });
    handle.focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowUp}');
    await user.keyboard(' ');

    await waitFor(() => expect(moveCardApiMock).toHaveBeenCalledWith('c6', 'l1', 0));
    expect(moveCardApiMock).toHaveBeenCalledTimes(1);
  });

  it('cancels a keyboard drag without a request', async () => {
    const user = userEvent.setup();
    mockCardLayout();
    render(
      <AppProvider initialAppState={initialState}>
        <BoardView />
      </AppProvider>,
    );

    const handle = screen.getByRole('button', { name: 'Drag Migrate to Node 20 LTS' });
    handle.focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowUp}');
    await user.keyboard('{Escape}');

    expect(moveCardApiMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Canceled moving Migrate to Node 20 LTS.')).toBeInTheDocument();
  });

  it('restores the previous card order when persistence fails', async () => {
    const user = userEvent.setup();
    mockCardLayout();
    moveCardApiMock.mockRejectedValue(new Error('Network unavailable'));
    render(
      <AppProvider initialAppState={initialState}>
        <BoardView />
      </AppProvider>,
    );

    const handle = screen.getByRole('button', { name: 'Drag Migrate to Node 20 LTS' });
    handle.focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowUp}');
    await user.keyboard(' ');

    expect(await screen.findByText('Could not move Migrate to Node 20 LTS. The previous order was restored.')).toBeInTheDocument();
    const backlog = document.querySelector('[data-list-id="l1"]')!;
    expect([...backlog.querySelectorAll('[data-card-id]')].map(element => element.getAttribute('data-card-id'))).toEqual(['c5', 'c6']);
  });

  it('offers both sort directions alongside a separated archive action', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider initialAppState={initialState}>
        <BoardView />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'List actions for Backlog' }));
    expect(screen.getByRole('button', { name: 'Sort A to Z' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort Z to A' })).toBeInTheDocument();
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive list' })).toBeInTheDocument();
  });

  it('exposes sort and archive menu permissions independently', async () => {
    const user = userEvent.setup();
    canArchiveMock.mockReturnValue(false);
    const { unmount } = render(
      <AppProvider initialAppState={initialState}>
        <BoardView />
      </AppProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'List actions for Backlog' }));
    expect(screen.getByRole('button', { name: 'Sort A to Z' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive list' })).not.toBeInTheDocument();
    unmount();

    canEditCardsMock.mockReturnValue(false);
    canArchiveMock.mockReturnValue(true);
    render(
      <AppProvider initialAppState={initialState}>
        <BoardView />
      </AppProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'List actions for Backlog' }));
    expect(screen.queryByRole('button', { name: 'Sort A to Z' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive list' })).toBeInTheDocument();
  });

  it('sorts optimistically, disables duplicate actions while pending, then applies the authoritative result', async () => {
    const user = userEvent.setup();
    let resolveSort!: (value: Awaited<ReturnType<typeof import('../services/data')['sortListApi']>>) => void;
    sortListApiMock.mockReturnValue(new Promise(resolve => { resolveSort = resolve; }));
    render(
      <AppProvider initialAppState={initialState}>
        <BoardView />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'List actions for Backlog' }));
    await user.click(screen.getByRole('button', { name: 'Sort Z to A' }));
    expect(sortListApiMock).toHaveBeenCalledWith('l1', 'desc');
    expect(screen.getByRole('button', { name: 'Sort A to Z' })).toBeDisabled();
    const backlog = document.querySelector('[data-list-id="l1"]')!;
    expect([...backlog.querySelectorAll('[data-card-id]')].map(element => element.getAttribute('data-card-id'))).toEqual(['c6', 'c5']);

    const source = initialState.cards.filter(card => card.listId === 'l1' && !card.archived);
    resolveSort({ listId: 'l1', direction: 'desc', cards: [{ ...source[1], position: 0 }, { ...source[0], position: 1 }] });
    expect(await screen.findByText('Sorted Backlog Z to A.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sort A to Z' })).not.toBeInTheDocument();
  });

  it('restores the exact snapshot when list sorting fails', async () => {
    const user = userEvent.setup();
    sortListApiMock.mockRejectedValue(new Error('Network unavailable'));
    render(
      <AppProvider initialAppState={initialState}>
        <BoardView />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'List actions for Backlog' }));
    await user.click(screen.getByRole('button', { name: 'Sort Z to A' }));

    expect(await screen.findByText('Could not sort Backlog. The previous order was restored.')).toBeInTheDocument();
    const backlog = document.querySelector('[data-list-id="l1"]')!;
    expect([...backlog.querySelectorAll('[data-card-id]')].map(element => element.getAttribute('data-card-id'))).toEqual(['c5', 'c6']);
    expect(screen.getByRole('button', { name: 'Sort Z to A' })).toBeEnabled();
  });
});
