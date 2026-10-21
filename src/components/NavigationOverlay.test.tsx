import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavigationOverlay } from './NavigationOverlay';
import { AppProvider, initialState } from '../store';
import { createWorkspace, deleteWorkspace, updateWorkspace } from '../services/admin';
import { createBoardApi, deleteBoardApi, updateBoardApi } from '../services/data';
import { toggleBoardStarApi } from '../services/data';

const { createAutomationRuleApiMock, updateAutomationRuleApiMock, createBoardApiMock, updateBoardApiMock, deleteBoardApiMock, previewMock, commitMock, authState } = vi.hoisted(() => ({
  createAutomationRuleApiMock: vi.fn(),
  updateAutomationRuleApiMock: vi.fn(),
  createBoardApiMock: vi.fn(),
  updateBoardApiMock: vi.fn(),
  deleteBoardApiMock: vi.fn(), previewMock: vi.fn(), commitMock: vi.fn(),
  authState: {
    session: { permissions: { isSystemAdmin: false } },
    canEditBoardCards: vi.fn(() => true),
    canManageWorkspace: vi.fn<(workspaceId: string | null) => boolean>(() => true),
    canManageBoard: vi.fn<(boardId: string | null) => boolean>(() => true),
    canArchiveBoardContent: vi.fn<(boardId: string | null) => boolean>(() => true),
    canManageAutomation: vi.fn<(boardId: string | null) => boolean>(() => true),
    refresh: vi.fn(async () => {}),
  },
}));

vi.mock('../services/admin', () => ({
  createWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
}));

vi.mock('../services/data', async () => {
  const actual = await vi.importActual<typeof import('../services/data')>('../services/data');
  return {
    ...actual,
    createAutomationRuleApi: createAutomationRuleApiMock,
    updateAutomationRuleApi: updateAutomationRuleApiMock,
    createBoardApi: createBoardApiMock,
    updateBoardApi: updateBoardApiMock,
    deleteBoardApi: deleteBoardApiMock,
  };
});

vi.mock('../services/content', async () => ({ ...await vi.importActual<typeof import('../services/content')>('../services/content'), previewContentOperation: previewMock, commitContentOperation: commitMock }));
vi.mock('../services/collections', async () => ({ ...await vi.importActual<typeof import('../services/collections')>('../services/collections'), fetchCollections: vi.fn(async () => ({ items: [] })) }));

vi.mock('../lib/auth-context', () => ({
  useAuth: () => authState,
}));

const createWorkspaceMock = vi.mocked(createWorkspace);
const deleteWorkspaceMockInstance = vi.mocked(deleteWorkspace);
const updateWorkspaceMock = vi.mocked(updateWorkspace);
const createBoardApiMockInstance = vi.mocked(createBoardApi);
const updateBoardApiMockInstance = vi.mocked(updateBoardApi);
const deleteBoardApiMockInstance = vi.mocked(deleteBoardApi);

function renderOverlay(appState = initialState) {
  render(
    <AppProvider initialAppState={appState}>
      <NavigationOverlay open onClose={() => {}} />
    </AppProvider>,
  );
}

async function openAutomationForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Automations' }));
  await user.click(screen.getByRole('button', { name: '+ Create automation rule' }));
  return screen.getByPlaceholderText('Rule name…').closest('div');
}

describe('NavigationOverlay automations', () => {
  beforeEach(() => {
    previewMock.mockResolvedValue({ planHash: 'plan', counts: { boards: 1 }, warnings: [], unresolvedMappings: [], expiresAt: '2099-01-01T00:00:00Z' });
    commitMock.mockResolvedValue({});
    createAutomationRuleApiMock.mockReset();
    updateAutomationRuleApiMock.mockReset();
    createWorkspaceMock.mockReset();
    deleteWorkspaceMockInstance.mockReset();
    updateWorkspaceMock.mockReset();
    createBoardApiMockInstance.mockReset();
    updateBoardApiMockInstance.mockReset();
    deleteBoardApiMockInstance.mockReset();
    authState.session = { permissions: { isSystemAdmin: false } };
    authState.canManageWorkspace.mockReset();
    authState.canManageWorkspace.mockReturnValue(true);
    authState.canManageBoard.mockReset();
    authState.canManageBoard.mockReturnValue(true);
    authState.canArchiveBoardContent.mockReset();
    authState.canArchiveBoardContent.mockReturnValue(true);
    authState.canManageAutomation.mockReset();
    authState.canManageAutomation.mockReturnValue(true);
    authState.refresh.mockReset();
    authState.refresh.mockResolvedValue(undefined);
  });

  it('selects workspace and board directly inside Automations', async () => {
    const user = userEvent.setup();
    renderOverlay();

    await user.click(screen.getByRole('button', { name: 'Automations' }));
    expect(screen.getByLabelText('Automation workspace')).toBeInTheDocument();
    expect(screen.getByLabelText('Automation board')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Automation workspace'), 'w2');
    expect(screen.getByLabelText('Automation board')).toHaveValue('b3');
  });

  it('defaults to the leftmost accessible tab and hides board-admin-inaccessible tabs', () => {
    authState.canManageWorkspace.mockReturnValue(false);
    authState.canManageBoard.mockReturnValue(true);
    authState.canManageAutomation.mockReturnValue(false);

    renderOverlay();

    expect(screen.queryByPlaceholderText('Workspace name…')).not.toBeInTheDocument();
    expect(screen.getByText('Acme Engineering')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Workspaces' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Boards' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Automations' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('reserves responsive management height so an archive confirmation is not clipped', async () => {
    const user = userEvent.setup();
    const archivedState = {
      ...initialState,
      lists: initialState.lists.map(list => list.id === 'l1' ? { ...list, archived: true } : { ...list }),
      cards: initialState.cards.map(card => card.listId === 'l1' ? { ...card, archived: true } : { ...card }),
    };

    renderOverlay(archivedState);
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    await user.click(screen.getByRole('button', { name: 'Delete archived list Backlog' }));

    expect(screen.getByTestId('management-dialog')).toHaveClass('h-[min(42rem,85dvh)]');
    expect(screen.getByTestId('archive-items')).toHaveClass('min-h-[20rem]');
    const dialog = screen.getByRole('dialog', { name: 'Permanently delete list' });
    expect(dialog).toHaveClass('overflow-hidden');
    expect(screen.getByRole('button', { name: 'Cancel' }).closest('.overflow-y-auto')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();
  });

  it('renames a workspace inline on Enter without switching tabs', async () => {
    const user = userEvent.setup();
    authState.session = { permissions: { isSystemAdmin: true } };
    updateWorkspaceMock.mockResolvedValue({
      memberIds: [],
      id: 'w1',
      name: 'Platform Ops',
      description: initialState.workspaces[0].description,
      visibility: initialState.workspaces[0].visibility,
    });

    renderOverlay();

    await user.click(screen.getAllByRole('button', { name: /Acme Engineering/i })[0]);
    const input = screen.getByDisplayValue('Acme Engineering');
    await user.clear(input);
    await user.type(input, 'Platform Ops{enter}');

    await waitFor(() => {
      expect(updateWorkspaceMock).toHaveBeenCalledWith('w1', { name: 'Platform Ops' });
    });
    expect(screen.getByText('Platform Ops')).toBeInTheDocument();
    expect(screen.queryByLabelText('Board workspace')).not.toBeInTheDocument();
  });

  it('renames a workspace inline when the field blurs', async () => {
    const user = userEvent.setup();
    authState.session = { permissions: { isSystemAdmin: true } };
    updateWorkspaceMock.mockResolvedValue({
      memberIds: [],
      id: 'w1',
      name: 'Customer Success',
      description: initialState.workspaces[0].description,
      visibility: initialState.workspaces[0].visibility,
    });

    renderOverlay();

    await user.click(screen.getAllByRole('button', { name: /Acme Engineering/i })[0]);
    const input = screen.getByDisplayValue('Acme Engineering');
    await user.clear(input);
    await user.type(input, 'Customer Success');
    await user.click(screen.getByRole('button', { name: 'Boards' }));

    await waitFor(() => {
      expect(updateWorkspaceMock).toHaveBeenCalledWith('w1', { name: 'Customer Success' });
    });
  });

  it('cancels a workspace rename on Escape', async () => {
    const user = userEvent.setup();
    authState.session = { permissions: { isSystemAdmin: true } };

    renderOverlay();

    await user.click(screen.getAllByRole('button', { name: /Acme Engineering/i })[0]);
    const input = screen.getByDisplayValue('Acme Engineering');
    await user.clear(input);
    await user.type(input, 'Do Not Save');
    await user.keyboard('{Escape}');

    expect(updateWorkspaceMock).not.toHaveBeenCalled();
    expect(screen.getByText('Acme Engineering')).toBeInTheDocument();
  });

  it('keeps closed-board deletion out of Management', async () => {
    const user = userEvent.setup();
    renderOverlay({ ...initialState, boards: initialState.boards.map(board => board.id === 'b1' ? { ...board, lifecycleState: 'closed' as const } : board) });
    await user.click(screen.getByRole('button', { name: 'Boards' }));
    expect(screen.queryByLabelText('Delete board Platform Sprint 24')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete closed board' })).not.toBeInTheDocument();
  });

  it('deletes a closed workspace only after preview and typed confirmation', async () => {
    const user = userEvent.setup();
    authState.session = { permissions: { isSystemAdmin: true } };
    renderOverlay({ ...initialState, workspaces: initialState.workspaces.map(workspace => workspace.id === 'w1' ? { ...workspace, lifecycleState: 'closed' as const } : workspace) });
    await user.click(screen.getByLabelText('Delete workspace Acme Engineering'));
    await user.click(screen.getByRole('button', { name: 'Preview impact' }));
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(commitMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'delete', resourceType: 'workspace', sourceId: 'w1' }), expect.any(String)));
    expect(deleteWorkspaceMockInstance).not.toHaveBeenCalled();
    expect(authState.refresh).toHaveBeenCalled();
  });

  it('creates a board without closing the overlay or changing selection', async () => {
    const user = userEvent.setup();
    createBoardApiMockInstance.mockResolvedValue({
      ...initialState.boards[0],
      id: 'b-new',
      title: 'New Launch Board',
      starred: false,
    });

    renderOverlay();

    await user.click(screen.getByRole('button', { name: 'Boards' }));
    await user.click(screen.getByRole('button', { name: '+ Add board' }));
    await user.type(screen.getByPlaceholderText('Board name…'), 'New Launch Board{enter}');

    await waitFor(() => {
      expect(createBoardApiMockInstance).toHaveBeenCalledWith(expect.objectContaining({
        workspaceId: initialState.currentWorkspaceId,
        title: 'New Launch Board',
      }));
    });
    expect(screen.getByText('New Launch Board')).toBeInTheDocument();
    expect(screen.getByText('Management')).toBeInTheDocument();
    expect(screen.getByText('Platform Sprint 24')).toBeInTheDocument();
  });

  it('renames a board inline on Enter', async () => {
    const user = userEvent.setup();
    updateBoardApiMockInstance.mockResolvedValue({
      ...initialState.boards[0],
      title: 'Platform Launch',
    });

    renderOverlay();

    await user.click(screen.getByRole('button', { name: 'Boards' }));
    await user.click(screen.getByRole('button', { name: 'Platform Sprint 24' }));
    const input = screen.getByDisplayValue('Platform Sprint 24');
    await user.clear(input);
    await user.type(input, 'Platform Launch{enter}');

    await waitFor(() => {
      expect(updateBoardApiMockInstance).toHaveBeenCalledWith('b1', { title: 'Platform Launch' });
    });
    expect(screen.getByText('Platform Launch')).toBeInTheDocument();
  });

  it('renames a board inline when the field blurs', async () => {
    const user = userEvent.setup();
    updateBoardApiMockInstance.mockResolvedValue({
      ...initialState.boards[0],
      title: 'Platform Ready',
    });

    renderOverlay();

    await user.click(screen.getByRole('button', { name: 'Boards' }));
    await user.click(screen.getByRole('button', { name: 'Platform Sprint 24' }));
    const input = screen.getByDisplayValue('Platform Sprint 24');
    await user.clear(input);
    await user.type(input, 'Platform Ready');
    await user.click(screen.getByRole('button', { name: 'Workspaces' }));

    await waitFor(() => {
      expect(updateBoardApiMockInstance).toHaveBeenCalledWith('b1', { title: 'Platform Ready' });
    });
  });

  it('shows a workspace selector in Boards when multiple editable workspaces are available', async () => {
    const user = userEvent.setup();

    renderOverlay();

    await user.click(screen.getByRole('button', { name: 'Boards' }));
    expect(screen.getByLabelText('Board workspace')).toBeInTheDocument();
  });

  it('keeps the Boards workspace header static when only one editable workspace exists', async () => {
    const user = userEvent.setup();
    authState.canManageWorkspace.mockImplementation(workspaceId => workspaceId === 'w1');
    authState.canManageBoard.mockImplementation(boardId => boardId === 'b1' || boardId === 'b2');

    renderOverlay();

    await user.click(screen.getByRole('button', { name: 'Boards' }));
    expect(screen.queryByLabelText('Board workspace')).not.toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === 'Workspace: Acme Engineering')).toBeInTheDocument();
  });

  it('shows a board selector in Automations when multiple manageable boards are available', async () => {
    const user = userEvent.setup();
    const appState = {
      ...initialState,
      boards: [
        ...initialState.boards,
        {
          ...initialState.boards[0],
          id: 'b-extra',
          title: 'Automation Sandbox',
          workspaceId: initialState.currentWorkspaceId ?? 'w1',
        },
      ],
    };

    renderOverlay(appState);

    await user.click(screen.getByRole('button', { name: 'Automations' }));
    expect(screen.getByLabelText('Automation board')).toBeInTheDocument();
  });

  it('saves a new workspace on Enter and closes the inline creator', async () => {
    const user = userEvent.setup();
    authState.session = { permissions: { isSystemAdmin: true } };
    createWorkspaceMock.mockResolvedValue({ id: 'w-new', name: 'Operations', description: '', visibility: 'private' });

    renderOverlay();

    await user.click(screen.getByRole('button', { name: '+ Create workspace' }));
    await user.type(screen.getByPlaceholderText('Workspace name…'), 'Operations{enter}');

    await waitFor(() => {
      expect(createWorkspaceMock).toHaveBeenCalledWith({ name: 'Operations', description: '', visibility: 'private' });
    });
    expect(screen.queryByPlaceholderText('Workspace name…')).not.toBeInTheDocument();
  });

  it('saves a new workspace when the input blurs', async () => {
    const user = userEvent.setup();
    authState.session = { permissions: { isSystemAdmin: true } };
    createWorkspaceMock.mockResolvedValue({ id: 'w-new', name: 'Customer Success', description: '', visibility: 'private' });

    renderOverlay();

    await user.click(screen.getByRole('button', { name: '+ Create workspace' }));
    await user.type(screen.getByPlaceholderText('Workspace name…'), 'Customer Success');
    await user.click(screen.getByRole('button', { name: 'Boards' }));

    await waitFor(() => {
      expect(createWorkspaceMock).toHaveBeenCalledWith({ name: 'Customer Success', description: '', visibility: 'private' });
    });
    expect(screen.queryByPlaceholderText('Workspace name…')).not.toBeInTheDocument();
  });

  it('shows a validation error instead of silently failing', async () => {
    const user = userEvent.setup();
    renderOverlay();

    await openAutomationForm(user);
    await user.type(screen.getByPlaceholderText('Rule name…'), 'Assign reviewer');
    await user.click(screen.getByRole('button', { name: 'Create Rule' }));

    expect(createAutomationRuleApiMock).not.toHaveBeenCalled();
    expect(screen.getByText('Select a member to assign.')).toBeInTheDocument();
  });

  it('hides shared-star controls for boards the actor cannot manage', async () => {
    const user = userEvent.setup();
    authState.canManageBoard.mockImplementation(boardId => boardId === 'b1');
    renderOverlay();
    await user.click(screen.getByRole('button', { name: 'Boards' }));
    expect(screen.getByRole('button', { name: /(?:Unstar|Star) Platform Sprint 24/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /(?:Unstar|Star) Bug Tracker/ })).not.toBeInTheDocument();
  });

  it('keeps the shared star unchanged when the server rejects the mutation', async () => {
    const user = userEvent.setup();
    vi.spyOn(await import('../services/data'), 'toggleBoardStarApi').mockRejectedValueOnce(new Error('Access denied.'));
    renderOverlay();
    await user.click(screen.getByRole('button', { name: 'Boards' }));
    const board = initialState.boards[0];
    const label = `${board.starred ? 'Unstar' : 'Star'} ${board.title}`;
    await user.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(toggleBoardStarApi).toHaveBeenCalledWith(board.id));
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  it('creates a rule once the required action details are provided', async () => {
    const user = userEvent.setup();
    createAutomationRuleApiMock.mockResolvedValue({
      id: 'rule-new',
      boardId: 'b1',
      name: 'Assign reviewer',
      trigger: 'card_moved',
      triggerConfig: {},
      conditions: { listId: null, labelId: null },
      action: 'assign_member',
      actionConfig: { memberId: 'u1' },
      enabled: true,
      lastRunAt: null,
    });

    renderOverlay();

    const form = await openAutomationForm(user);
    if (!form) throw new Error('Automation form container not found.');

    await user.type(within(form).getByPlaceholderText('Rule name…'), 'Assign reviewer');
    await user.selectOptions(within(form).getAllByRole('combobox').at(-1)!, 'u1');
    await user.click(within(form).getByRole('button', { name: 'Create Rule' }));

    await waitFor(() => {
      expect(createAutomationRuleApiMock).toHaveBeenCalledWith({
        boardId: 'b1',
        name: 'Assign reviewer',
        trigger: 'card_moved',
        triggerConfig: {},
        conditions: { listId: null, labelId: null },
        action: 'assign_member',
        actionConfig: { memberId: 'u1' },
        enabled: true,
      });
    });

    expect(await screen.findByText('Assign reviewer')).toBeInTheDocument();
    expect(screen.queryByText('Select a member to assign.')).not.toBeInTheDocument();
  });

  it('opens an existing automation in edit mode and persists the complete updated rule', async () => {
    const user = userEvent.setup();
    const existing = initialState.automationRules.find(rule => rule.id === 'ar1')!;
    updateAutomationRuleApiMock.mockResolvedValue({ ...existing, name: 'Updated reviewer automation' });
    renderOverlay();

    await user.click(screen.getByRole('button', { name: 'Automations' }));
    await user.click(screen.getByRole('button', { name: `Edit automation ${existing.name}` }));
    const nameInput = screen.getByPlaceholderText('Rule name…');
    expect(nameInput).toHaveValue(existing.name);
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated reviewer automation');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(updateAutomationRuleApiMock).toHaveBeenCalledWith('ar1', {
      name: 'Updated reviewer automation',
      trigger: 'card_moved',
      triggerConfig: { toListId: 'l4' },
      conditions: { listId: null, labelId: null },
      action: 'assign_member',
      actionConfig: { memberId: 'u2' },
      enabled: true,
    }));
    expect(screen.getByText('Updated reviewer automation')).toBeInTheDocument();
  });

  it('preserves the existing rule and draft when an edit fails, and Cancel discards the draft', async () => {
    const user = userEvent.setup();
    const existing = initialState.automationRules.find(rule => rule.id === 'ar2')!;
    updateAutomationRuleApiMock.mockRejectedValue(new Error('Automation update unavailable'));
    renderOverlay();

    await user.click(screen.getByRole('button', { name: 'Automations' }));
    await user.click(screen.getByRole('button', { name: `Edit automation ${existing.name}` }));
    const nameInput = screen.getByPlaceholderText('Rule name…');
    await user.clear(nameInput);
    await user.type(nameInput, 'Unsaved automation title');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('Automation update unavailable')).toBeInTheDocument();
    expect(nameInput).toHaveValue('Unsaved automation title');
    expect(screen.getByRole('heading', { name: existing.name })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByPlaceholderText('Rule name…')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: existing.name })).toBeInTheDocument();
  });
});
