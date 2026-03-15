import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavigationOverlay } from './NavigationOverlay';
import { AppProvider, initialState } from '../store';
import { createWorkspace, deleteWorkspace } from '../services/admin';
import { createBoardApi, deleteBoardApi } from '../services/data';

const { createAutomationRuleApiMock, createBoardApiMock, deleteBoardApiMock, authState } = vi.hoisted(() => ({
  createAutomationRuleApiMock: vi.fn(),
  createBoardApiMock: vi.fn(),
  deleteBoardApiMock: vi.fn(),
  authState: {
    session: { permissions: { isSystemAdmin: false } },
    canManageWorkspace: vi.fn(() => true),
    canManageBoard: vi.fn(() => true),
    canManageAutomation: vi.fn(() => true),
    refresh: vi.fn(async () => {}),
  },
}));

vi.mock('../services/admin', () => ({
  createWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
}));

vi.mock('../services/data', async () => {
  const actual = await vi.importActual<typeof import('../services/data')>('../services/data');
  return {
    ...actual,
    createAutomationRuleApi: createAutomationRuleApiMock,
    createBoardApi: createBoardApiMock,
    deleteBoardApi: deleteBoardApiMock,
  };
});

vi.mock('../lib/auth-context', () => ({
  useAuth: () => authState,
}));

const createWorkspaceMock = vi.mocked(createWorkspace);
const deleteWorkspaceMockInstance = vi.mocked(deleteWorkspace);
const createBoardApiMockInstance = vi.mocked(createBoardApi);
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
    createAutomationRuleApiMock.mockReset();
    createWorkspaceMock.mockReset();
    deleteWorkspaceMockInstance.mockReset();
    createBoardApiMockInstance.mockReset();
    deleteBoardApiMockInstance.mockReset();
    authState.session = { permissions: { isSystemAdmin: false } };
    authState.canManageWorkspace.mockReset();
    authState.canManageWorkspace.mockReturnValue(true);
    authState.canManageBoard.mockReset();
    authState.canManageBoard.mockReturnValue(true);
    authState.canManageAutomation.mockReset();
    authState.canManageAutomation.mockReturnValue(true);
    authState.refresh.mockReset();
    authState.refresh.mockResolvedValue(undefined);
  });

  it('defaults to the leftmost accessible tab and hides board-admin-inaccessible tabs', async () => {
    const user = userEvent.setup();
    authState.canManageWorkspace.mockReturnValue(false);
    authState.canManageBoard.mockReturnValue(true);

    renderOverlay();

    expect(screen.queryByPlaceholderText('Workspace name…')).not.toBeInTheDocument();
    expect(screen.getByText('Acme Engineering')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Workspaces' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Boards' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Automations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Acme Engineering/i }));
    expect(screen.getByText((_, element) => element?.textContent === `Workspace: ${initialState.workspaces[0].name}`)).toBeInTheDocument();
    expect(screen.queryByText('workspace')).not.toBeInTheDocument();
  });

  it('deletes a board after DELETE confirmation', async () => {
    const user = userEvent.setup();
    deleteBoardApiMockInstance.mockResolvedValue({ success: true });

    renderOverlay();

    await user.click(screen.getByRole('button', { name: 'Boards' }));
    await user.click(screen.getByLabelText('Delete board Platform Sprint 24'));
    expect(screen.getByPlaceholderText('Type DELETE to confirm')).toBeInTheDocument();

    const yesButton = screen.getByRole('button', { name: 'YES' });
    expect(yesButton).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Type DELETE to confirm'), 'DELETE');
    expect(yesButton).toBeEnabled();
    await user.click(yesButton);

    await waitFor(() => {
      expect(deleteBoardApiMockInstance).toHaveBeenCalledWith('b1');
      expect(authState.refresh).toHaveBeenCalled();
    });
  });

  it('deletes a workspace after DELETE confirmation', async () => {
    const user = userEvent.setup();
    authState.session = { permissions: { isSystemAdmin: true } };
    deleteWorkspaceMockInstance.mockResolvedValue({ success: true });

    renderOverlay();

    await user.click(screen.getByLabelText('Delete workspace Acme Engineering'));
    await user.type(screen.getByPlaceholderText('Type DELETE to confirm'), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'YES' }));

    await waitFor(() => {
      expect(deleteWorkspaceMockInstance).toHaveBeenCalledWith('w1');
      expect(authState.refresh).toHaveBeenCalled();
    });
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
});
