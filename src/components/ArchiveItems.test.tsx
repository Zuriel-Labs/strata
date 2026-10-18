import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProvider, initialState } from '../store';
import { ArchiveItems } from './ArchiveItems';
import { getArchivedBoardItems } from '../lib/archive-items';

const { deleteListApiMock, previewMock, commitMock, authState } = vi.hoisted(() => ({
  deleteListApiMock: vi.fn(), previewMock: vi.fn(), commitMock: vi.fn(),
  authState: {
    canArchiveBoardContent: vi.fn(() => true), canManageWorkspace: vi.fn(() => true), canManageBoard: vi.fn(() => true), canEditBoardCards: vi.fn(() => true), refresh: vi.fn(async () => {}),
  },
}));

vi.mock('../services/data', async () => {
  const actual = await vi.importActual<typeof import('../services/data')>('../services/data');
  return { ...actual, deleteListApi: deleteListApiMock };
});

vi.mock('../services/content', () => ({ previewContentOperation: previewMock, commitContentOperation: commitMock }));

vi.mock('../lib/auth-context', () => ({ useAuth: () => authState }));

function archivedState() {
  return {
    ...initialState,
    lists: initialState.lists.map(list => list.id === 'l1' ? { ...list, archived: true } : { ...list }),
    cards: initialState.cards.map(card => (
      card.id === 'c3' || card.listId === 'l1' ? { ...card, archived: true } : { ...card }
    )),
  };
}

describe('ArchiveItems', () => {
  beforeEach(() => {
    previewMock.mockResolvedValue({ planHash: 'plan', counts: { lists: 1, cards: 2 }, warnings: [], unresolvedMappings: [], expiresAt: '2099-01-01T00:00:00Z' });
    commitMock.mockResolvedValue({});
    deleteListApiMock.mockReset();
    deleteListApiMock.mockResolvedValue({ success: true, deletedCardCount: 2 });
    authState.canArchiveBoardContent.mockReturnValue(true);
  });

  it('projects an archived list once and keeps only independently archived cards', () => {
    const projection = getArchivedBoardItems(archivedState(), 'b1');
    expect(projection.archivedLists.map(list => list.id)).toEqual(['l1']);
    expect(projection.archivedCards.map(card => card.id)).toEqual(['c3']);
  });

  it('confirms and permanently deletes an archived list for authorized board managers', async () => {
    const user = userEvent.setup();
    render(<AppProvider initialAppState={archivedState()}><ArchiveItems /></AppProvider>);

    expect(screen.getByText(/Backlog/)).toBeInTheDocument();
    expect(screen.queryByText('Evaluate state management options')).not.toBeInTheDocument();
    expect(screen.getByText(/Implement OAuth2 login flow/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete archived list Backlog' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/permanently delete/i);
    await user.click(screen.getByRole('button', { name: 'Preview impact' }));
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(commitMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'delete', sourceId: 'l1', confirmation: 'DELETE', planHash: 'plan' }), expect.any(String));
    expect(deleteListApiMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Backlog/)).not.toBeInTheDocument();
  });

  it('hides permanent deletion controls from users without archive authority', () => {
    authState.canArchiveBoardContent.mockReturnValue(false);
    render(<AppProvider initialAppState={archivedState()}><ArchiveItems /></AppProvider>);
    expect(screen.queryByRole('button', { name: 'Delete archived list Backlog' })).not.toBeInTheDocument();
  });
});
