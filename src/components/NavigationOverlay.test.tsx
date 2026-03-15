import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavigationOverlay } from './NavigationOverlay';
import { AppProvider, initialState } from '../store';

const { createAutomationRuleApiMock } = vi.hoisted(() => ({
  createAutomationRuleApiMock: vi.fn(),
}));

vi.mock('../services/admin', () => ({
  createWorkspace: vi.fn(),
}));

vi.mock('../services/data', async () => {
  const actual = await vi.importActual<typeof import('../services/data')>('../services/data');
  return {
    ...actual,
    createAutomationRuleApi: createAutomationRuleApiMock,
  };
});

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    canManageWorkspace: () => true,
    canManageBoard: () => true,
    canManageAutomation: () => true,
  }),
}));

function renderOverlay() {
  render(
    <AppProvider initialAppState={initialState}>
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
