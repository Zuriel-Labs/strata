import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardModal } from './CardModal';
import { AppProvider, initialState } from '../store';
import type { AppState, Attachment } from '../types';

const fetchMock = vi.fn();
const authState = {
  canEditBoardCards: vi.fn(() => true),
  canManageBoard: vi.fn(() => true),
};

vi.mock('../lib/auth-context', () => ({
  useAuth: () => authState,
}));

function buildState(cardId: string, overrides?: Partial<AppState['cards'][number]>): AppState {
  return {
    ...initialState,
    activeCardId: cardId,
    cards: initialState.cards.map(card => (
      card.id === cardId
        ? {
            ...card,
            ...overrides,
            memberIds: overrides?.memberIds ?? [...card.memberIds],
            labelIds: overrides?.labelIds ?? [...card.labelIds],
            attachments: overrides?.attachments ?? [...card.attachments],
            comments: overrides?.comments ?? [...card.comments],
            activity: overrides?.activity ?? [...card.activity],
          }
        : { ...card }
    )),
    lists: initialState.lists.map(list => ({ ...list })),
    boards: initialState.boards.map(board => ({ ...board, labels: [...board.labels] })),
    users: initialState.users.map(user => ({ ...user })),
    workspaces: initialState.workspaces.map(workspace => ({ ...workspace, memberIds: [...workspace.memberIds] })),
    automationRules: initialState.automationRules.map(rule => ({ ...rule })),
    notifications: initialState.notifications.map(notification => ({ ...notification })),
  };
}

describe('CardModal', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => Response.json({}));
    vi.stubGlobal('fetch', fetchMock);
    authState.canEditBoardCards.mockReset();
    authState.canEditBoardCards.mockReturnValue(true);
    authState.canManageBoard.mockReset();
    authState.canManageBoard.mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows default sections first and reveals optional sections on demand', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider initialAppState={buildState('c5', {
        memberIds: [],
        labelIds: [],
        dueDate: null,
        attachments: [],
        comments: [],
        activity: [],
      })}
      >
        <CardModal />
      </AppProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Description' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Comments and activity' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Members' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Labels' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Checklist/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /members/i }));
    await user.click(screen.getByRole('button', { name: /labels/i }));
    await user.click(screen.getByRole('button', { name: /dates/i }));
    await user.click(screen.getByRole('button', { name: /attachment/i }));

    expect(screen.getByRole('heading', { name: 'Members' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search labels')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Labels' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Due date' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Attachments' })).toBeInTheDocument();
  });

  it('supports watch toggling, inline title edits, and list moves from the top bar', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider initialAppState={buildState('c5', { labelIds: [], attachments: [], comments: [], activity: [] })}>
        <CardModal />
      </AppProvider>,
    );

    await user.click(screen.getByLabelText('Watch card'));
    expect(screen.getByLabelText('Stop watching card')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Evaluate state management options' }));
    const titleInput = screen.getByDisplayValue('Evaluate state management options');
    await user.clear(titleInput);
    await user.type(titleInput, 'Refine state management decision');
    await user.tab();

    expect(screen.getByRole('button', { name: 'Refine state management decision' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Card list'), 'l2');
    expect(screen.getByLabelText('Card list')).toHaveValue('l2');
    expect(screen.getByText('In list', { exact: false })).toBeInTheDocument();
    expect(screen.queryByLabelText('Delete card')).toBeInTheDocument();
  });

  it('hides the card delete control for non-board-admin roles', () => {
    authState.canManageBoard.mockReturnValue(false);

    render(
      <AppProvider initialAppState={buildState('c5')}>
        <CardModal />
      </AppProvider>,
    );

    expect(screen.queryByLabelText('Delete card')).not.toBeInTheDocument();
  });

  it('shows a searchable Labels picker and applies labels through it', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider initialAppState={buildState('c5', { labelIds: [] })}>
        <CardModal />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Labels' }));
    await user.type(screen.getByPlaceholderText('Search labels'), 'bug');
    expect(screen.queryByRole('heading', { name: 'Labels' })).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: /bug\s*add/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /feature\s*add/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /bug\s*add/i }));
    expect(screen.getByRole('button', { name: 'Bug' })).toBeInTheDocument();

    await user.click(screen.getByTestId('labels-panel-backdrop'));
    expect(screen.queryByPlaceholderText('Search labels')).not.toBeInTheDocument();
  });

  it('closes the labels panel from its close button', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider initialAppState={buildState('c5', { labelIds: [] })}>
        <CardModal />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Labels' }));
    expect(screen.getByPlaceholderText('Search labels')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Close labels panel'));
    expect(screen.queryByPlaceholderText('Search labels')).not.toBeInTheDocument();
  });

  it('renders color-only applied labels as square chips', () => {
    const state = buildState('c5', { labelIds: ['lb1'] });
    state.boards = state.boards.map(board => board.id === 'b1'
      ? { ...board, labels: board.labels.map(label => label.id === 'lb1' ? { ...label, name: '' } : label) }
      : board);

    render(
      <AppProvider initialAppState={state}>
        <CardModal />
      </AppProvider>,
    );

    expect(screen.getByRole('button', { name: 'Color-only label' })).toHaveClass('h-11', 'w-11', 'rounded-md');
  });

  it('renders download and view actions for persisted browser-viewable file attachments', () => {
    const attachment: Attachment = {
      id: 'at-uploaded',
      name: 'brief.txt',
      kind: 'file',
      url: 'data:text/plain;base64,SGVsbG8=',
      size: 5,
      mimeType: 'text/plain',
      createdAt: new Date().toISOString(),
    };

    render(
      <AppProvider initialAppState={buildState('c5', { attachments: [attachment] })}>
        <CardModal />
      </AppProvider>,
    );

    expect(screen.getByRole('link', { name: 'Download brief.txt' })).toHaveAttribute('download', 'brief.txt');
    expect(screen.getByRole('link', { name: 'View brief.txt' })).toHaveAttribute('target', '_blank');
  });

  it('uploads a file with a persisted payload and exposes download and view actions', async () => {
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
      onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

      readAsDataURL(file: Blob) {
        this.result = `data:${file.type || 'application/octet-stream'};base64,ZmFrZQ==`;
        this.onload?.call(this as unknown as FileReader, new ProgressEvent('load') as ProgressEvent<FileReader>);
      }
    }

    vi.stubGlobal('FileReader', MockFileReader as unknown as typeof FileReader);

    const user = userEvent.setup();
    render(
      <AppProvider initialAppState={buildState('c5', { attachments: [] })}>
        <CardModal />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: /attachment/i }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    await user.upload(fileInput!, new File(['fake file'], 'notes.txt', { type: 'text/plain' }));

    expect(await screen.findByText('notes.txt')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download notes.txt' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View notes.txt' })).toBeInTheDocument();

    const lastCall = fetchMock.mock.calls.at(-1);
    const requestInit = lastCall?.[1] as RequestInit | undefined;
    const payload = JSON.parse(String(requestInit?.body ?? '{}'));

    expect(payload.attachments).toEqual([
      expect.objectContaining({
        name: 'notes.txt',
        kind: 'file',
        url: 'data:text/plain;base64,ZmFrZQ==',
        mimeType: 'text/plain',
      }),
    ]);
  });

  it('shows download without view for non-browser-viewable file attachments', () => {
    const attachment: Attachment = {
      id: 'at-binary',
      name: 'archive.bin',
      kind: 'file',
      url: 'data:application/octet-stream;base64,AAEC',
      size: 3,
      mimeType: 'application/octet-stream',
      createdAt: new Date().toISOString(),
    };

    render(
      <AppProvider initialAppState={buildState('c5', { attachments: [attachment] })}>
        <CardModal />
      </AppProvider>,
    );

    expect(screen.getByRole('link', { name: 'Download archive.bin' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View archive.bin' })).not.toBeInTheDocument();
  });

  it('renders preserved history and sends new comments from the modal', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider initialAppState={buildState('c5', {
        comments: [{ id: 'cm-legacy', userId: 'u999', text: 'Legacy context', createdAt: '2026-03-14T12:00:00.000Z' }],
        activity: [{ id: 'ac-system', userId: 'system', action: 'generated a summary', createdAt: '2026-03-14T12:05:00.000Z' }],
      })}>
        <CardModal />
      </AppProvider>,
    );

    expect(screen.getByText('Deleted user')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('Legacy context')).toBeInTheDocument();
    expect(screen.getByText(/generated a summary/i)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Write a comment...'), 'Need an updated draft');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(screen.getByPlaceholderText('Write a comment...')).toHaveValue('');

    const lastCall = fetchMock.mock.calls.at(-1);
    const requestInit = lastCall?.[1] as RequestInit | undefined;
    const payload = JSON.parse(String(requestInit?.body ?? '{}'));

    expect(payload.comments).toEqual([
      expect.objectContaining({ text: 'Legacy context', userId: 'u999' }),
      expect.objectContaining({ text: 'Need an updated draft', userId: initialState.currentUserId }),
    ]);
  });

  it('requires DELETE confirmation before deleting a card', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider initialAppState={buildState('c5')}>
        <CardModal />
      </AppProvider>,
    );

    await user.click(screen.getByLabelText('Delete card'));
    const yesButton = screen.getByRole('button', { name: 'YES' });

    expect(yesButton).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Type DELETE to confirm'), 'DELETE');
    expect(yesButton).toBeEnabled();
    await user.click(yesButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/cards/c5', expect.objectContaining({ method: 'DELETE' }));
    });
  });
});
