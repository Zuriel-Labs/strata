import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardModal } from './CardModal';
import { AppProvider, initialState } from '../store';
import type { AppState, Attachment } from '../types';
import { plainTextToRichTextDocument } from '../lib/rich-text';

const fetchMock = vi.fn();
const authState = {
  canEditBoardCards: vi.fn(() => true),
  canManageBoard: vi.fn(() => true),
  canManageBoardLabels: vi.fn(() => true),
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
            checklists: overrides?.checklists ?? card.checklists.map(checklist => ({
              ...checklist,
              items: checklist.items.map(item => ({ ...item })),
            })),
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
    authState.canManageBoardLabels.mockReset();
    authState.canManageBoardLabels.mockReturnValue(true);
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
    expect(screen.getByRole('heading', { name: 'Checklists' })).toBeInTheDocument();

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

  it('duplicates a card once, applies authoritative ordering, and opens the copy', async () => {
    const user = userEvent.setup();
    const state = buildState('c5');
    const source = state.cards.find(card => card.id === 'c5')!;
    fetchMock.mockResolvedValue(Response.json({
      ...source,
      id: 'c-copy',
      title: `${source.title} (copy)`,
      position: source.position + 1,
      watching: false,
      comments: [],
      activity: [{ id: 'copy-activity', userId: 'u1', action: 'duplicated this card', createdAt: '2026-08-25T00:00:00.000Z' }],
      createdAt: '2026-08-25T00:00:00.000Z',
    }));

    render(<AppProvider initialAppState={state}><CardModal /></AppProvider>);
    await user.click(screen.getByRole('button', { name: 'Duplicate card' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cards/c5/duplicate', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByRole('button', { name: 'Evaluate state management options (copy)' })).toBeInTheDocument();
    expect(screen.getByText(/card duplicated/i)).toBeInTheDocument();
  });

  it('locks duplicate submission while pending and preserves the source after failure', async () => {
    const user = userEvent.setup();
    let resolveRequest: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation(() => new Promise<Response>(resolve => { resolveRequest = resolve; }));
    render(<AppProvider initialAppState={buildState('c5')}><CardModal /></AppProvider>);

    const duplicateButton = screen.getByRole('button', { name: 'Duplicate card' });
    await user.click(duplicateButton);
    expect(duplicateButton).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveRequest?.(new Response(JSON.stringify({ message: 'Duplicate unavailable' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Duplicate unavailable');
    expect(screen.getByRole('button', { name: 'Evaluate state management options' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate card' })).toBeEnabled();
  });

  it('does not expose card duplication to read-only roles', () => {
    authState.canEditBoardCards.mockReturnValue(false);
    render(<AppProvider initialAppState={buildState('c5')}><CardModal /></AppProvider>);
    expect(screen.queryByRole('button', { name: 'Duplicate card' })).not.toBeInTheDocument();
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

  it('uses Add and Added label rows as a reversible assignment toggle', async () => {
    const user = userEvent.setup();
    const state = buildState('c5', { labelIds: ['lb3'] });
    fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const updates = JSON.parse(String(init?.body ?? '{}'));
      return Response.json({ ...state.cards.find(card => card.id === 'c5'), ...updates });
    });

    render(<AppProvider initialAppState={state}><CardModal /></AppProvider>);
    await user.click(screen.getByRole('button', { name: 'Labels' }));
    const assignedRow = screen.getByRole('button', { name: /bug\s*added/i });
    expect(assignedRow).toBeEnabled();

    await user.click(assignedRow);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cards/c5', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ labelIds: [] }),
    })));
    expect(await screen.findByRole('button', { name: /bug\s*add/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Bug' })).not.toBeInTheDocument();
  });

  it('restores an assigned label and reports the failure when toggle persistence fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new Error('Label service unavailable'));

    render(<AppProvider initialAppState={buildState('c5', { labelIds: ['lb3'] })}><CardModal /></AppProvider>);
    await user.click(screen.getByRole('button', { name: 'Labels' }));
    await user.click(screen.getByRole('button', { name: /bug\s*added/i }));

    expect(await screen.findByRole('button', { name: /bug\s*added/i })).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Label service unavailable');
    expect(screen.getByRole('button', { name: 'Bug' })).toBeInTheDocument();
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

  it('creates a shared label inside the card and assigns it after the aggregate saves', async () => {
    const user = userEvent.setup();
    const state = buildState('c5', { labelIds: [] });
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const payload = JSON.parse(String(init?.body ?? '{}'));
      if (path === '/api/boards/b1/labels') return Response.json({ boardId: 'b1', labels: payload.labels });
      if (path === '/api/cards/c5') {
        return Response.json({ ...state.cards.find(card => card.id === 'c5'), ...payload });
      }
      return new Response(null, { status: 404 });
    });

    render(<AppProvider initialAppState={state}><CardModal /></AppProvider>);
    await user.click(screen.getByRole('button', { name: 'Labels' }));
    await user.click(screen.getByRole('button', { name: 'Manage labels in card' }));
    await user.click(screen.getByRole('button', { name: 'Add new label' }));
    const inputs = screen.getAllByPlaceholderText('Label name');
    await user.type(inputs.at(-1)!, 'Canary');
    await user.click(screen.getByRole('button', { name: 'Save labels' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const labelPayload = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    const newLabel = labelPayload.labels.find((label: { name: string }) => label.name === 'Canary');
    const cardPayload = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(cardPayload.labelIds).toContain(newLabel.id);
    expect(await screen.findByRole('button', { name: 'Canary' })).toBeInTheDocument();
  });

  it('renames and deletes shared labels in context with board-wide cleanup', async () => {
    const user = userEvent.setup();
    const state = buildState('c5', { labelIds: ['lb3'] });
    fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body ?? '{}'));
      return Response.json({ boardId: 'b1', labels: payload.labels });
    });

    render(<AppProvider initialAppState={state}><CardModal /></AppProvider>);
    await user.click(screen.getByRole('button', { name: 'Labels' }));
    await user.click(screen.getByRole('button', { name: 'Manage labels in card' }));
    await user.clear(screen.getByDisplayValue('Bug'));
    await user.type(screen.getAllByPlaceholderText('Label name')[2], 'Defect');
    await user.click(screen.getByRole('button', { name: 'Save labels' }));
    expect(await screen.findByRole('button', { name: 'Defect' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Manage labels in card' }));
    await user.click(screen.getByRole('button', { name: 'Delete Defect' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/1 card/i);
    await user.click(screen.getByRole('button', { name: 'Confirm delete label' }));
    await user.click(screen.getByRole('button', { name: 'Save labels' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Defect' })).not.toBeInTheDocument());
  });

  it('keeps label assignment available without exposing definition management permission', async () => {
    authState.canManageBoardLabels.mockReturnValue(false);
    const user = userEvent.setup();
    render(<AppProvider initialAppState={buildState('c5', { labelIds: [] })}><CardModal /></AppProvider>);

    await user.click(screen.getByRole('button', { name: 'Labels' }));
    expect(screen.getByPlaceholderText('Search labels')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage labels in card' })).not.toBeInTheDocument();
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

  it('renders a saved rich-text Description with preserved multiline formatting', () => {
    const descriptionDocument = {
      type: 'doc' as const,
      content: [
        { type: 'heading' as const, attrs: { level: 2 as const }, content: [{ type: 'text' as const, text: 'Launch plan' }] },
        { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'First line' }, { type: 'hardBreak' as const }, { type: 'text' as const, text: 'Second line', marks: [{ type: 'bold' as const }] }] },
      ],
    };

    render(
      <AppProvider initialAppState={buildState('c5', { description: 'Launch plan\nFirst line\nSecond line', descriptionDocument })}>
        <CardModal />
      </AppProvider>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Launch plan' })).toBeInTheDocument();
    expect(screen.getByTestId('rich-text-description')).toHaveTextContent('First lineSecond line');
    expect(screen.getByRole('button', { name: 'Edit description' })).toBeInTheDocument();
  });

  it('keeps read-mode hyperlinks clickable without entering edit mode and shares rich-text styling', async () => {
    const user = userEvent.setup();
    const descriptionDocument = {
      type: 'doc' as const,
      content: [{
        type: 'paragraph' as const,
        content: [{
          type: 'text' as const,
          text: 'Open the brief',
          marks: [{ type: 'link' as const, attrs: { href: 'https://example.com/brief' } }],
        }],
      }],
    };
    render(
      <AppProvider initialAppState={buildState('c5', { description: 'Open the brief', descriptionDocument })}>
        <CardModal />
      </AppProvider>,
    );

    const link = screen.getByRole('link', { name: 'Open the brief' });
    expect(link).toHaveAttribute('href', 'https://example.com/brief');
    expect(screen.getByTestId('rich-text-description')).toHaveClass('rich-text-content');
    await user.click(link);
    expect(screen.queryByRole('textbox', { name: 'Description editor' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit description' }));
    expect(await screen.findByRole('textbox', { name: 'Description editor' })).toHaveClass('rich-text-content');
  });

  it('saves Description edits as structured rich text and returns to formatted view', async () => {
    const user = userEvent.setup();
    const state = buildState('c5', { description: '', descriptionDocument: plainTextToRichTextDocument('') });
    fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const updates = JSON.parse(String(init?.body ?? '{}'));
      return Response.json({ ...state.cards.find(card => card.id === 'c5'), ...updates, description: 'Launch notes' });
    });

    render(
      <AppProvider initialAppState={state}>
        <CardModal />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Edit description' }));
    await user.type(await screen.findByRole('textbox', { name: 'Description editor' }), 'Launch notes');
    await user.click(screen.getByRole('button', { name: 'Save description' }));

    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Description editor' })).not.toBeInTheDocument());
    const request = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload).not.toHaveProperty('description');
    expect(payload.descriptionDocument).toEqual(expect.objectContaining({ type: 'doc' }));
    expect(screen.getByTestId('rich-text-description')).toHaveTextContent('Launch notes');
  });

  it('keeps the rich-text draft open when Description saving fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'Temporary failure' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));

    render(
      <AppProvider initialAppState={buildState('c5', { description: 'Original', descriptionDocument: plainTextToRichTextDocument('Original') })}>
        <CardModal />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Edit description' }));
    const editor = await screen.findByRole('textbox', { name: 'Description editor' });
    await user.click(editor);
    await user.type(editor, ' draft');
    await user.click(screen.getByRole('button', { name: 'Save description' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/temporary failure/i);
    expect(screen.getByRole('textbox', { name: 'Description editor' })).toHaveTextContent('Original');
    expect(screen.getByRole('textbox', { name: 'Description editor' })).toHaveTextContent('draft');
  });

  it('renders checklist progress and persists create, add, toggle, and delete mutations', async () => {
    const user = userEvent.setup();
    const state = buildState('c5', {
      checklists: [{
        id: 'checklist-qa',
        title: 'QA',
        items: [
          { id: 'item-lint', text: 'Lint', completed: true },
          { id: 'item-smoke', text: 'Smoke test', completed: false },
        ],
      }],
    });
    let serverCard = state.cards.find(card => card.id === 'c5')!;
    fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const updates = JSON.parse(String(init?.body ?? '{}'));
      serverCard = { ...serverCard, ...updates };
      return Response.json(serverCard);
    });

    render(<AppProvider initialAppState={state}><CardModal /></AppProvider>);

    expect(screen.getByRole('heading', { name: 'Checklists' })).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add checklist' }));
    await user.type(screen.getByPlaceholderText('Checklist title'), 'Release');
    await user.click(screen.getByRole('button', { name: 'Save checklist' }));
    expect(await screen.findByText('Release')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add item to QA' }));
    await user.type(screen.getByPlaceholderText('Checklist item'), 'Browser verification');
    await user.click(screen.getByRole('button', { name: 'Save checklist item' }));
    expect(await screen.findByText('Browser verification')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Mark Smoke test complete' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Mark Smoke test incomplete' })).toBeChecked());

    await user.click(screen.getByRole('button', { name: 'Delete checklist item Browser verification' }));
    await waitFor(() => expect(screen.queryByText('Browser verification')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('keeps checklist content read-only when card editing is unavailable', () => {
    authState.canEditBoardCards.mockReturnValue(false);
    render(
      <AppProvider initialAppState={buildState('c5', {
        checklists: [{ id: 'checklist-ro', title: 'Read only', items: [{ id: 'item-ro', text: 'Visible item', completed: true }] }],
      })}>
        <CardModal />
      </AppProvider>,
    );

    expect(screen.getByText('Visible item')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mark Visible item incomplete' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add checklist' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add item to Read only' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete checklist item Visible item' })).not.toBeInTheDocument();
  });

  it('retains an unsaved checklist item and authoritative card state when persistence fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'Checklist unavailable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    }));
    render(
      <AppProvider initialAppState={buildState('c5', {
        checklists: [{ id: 'checklist-fail', title: 'Failure path', items: [] }],
      })}>
        <CardModal />
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Add item to Failure path' }));
    await user.type(screen.getByPlaceholderText('Checklist item'), 'Keep this draft');
    await user.click(screen.getByRole('button', { name: 'Save checklist item' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Checklist unavailable');
    expect(screen.getByPlaceholderText('Checklist item')).toHaveValue('Keep this draft');
    expect(screen.queryByText('Keep this draft', { selector: 'span' })).not.toBeInTheDocument();
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
