import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutomationPanel } from './AutomationPanel';
import { AppProvider, initialState } from '../store';

const { createAutomationRuleApiMock } = vi.hoisted(() => ({
  createAutomationRuleApiMock: vi.fn(),
}));

vi.mock('../services/data', async () => {
  const actual = await vi.importActual<typeof import('../services/data')>('../services/data');
  return {
    ...actual,
    createAutomationRuleApi: createAutomationRuleApiMock,
  };
});

function renderPanel() {
  render(
    <AppProvider initialAppState={{ ...initialState, automationPanelOpen: true }}>
      <AutomationPanel />
    </AppProvider>,
  );
}

describe('AutomationPanel', () => {
  beforeEach(() => {
    createAutomationRuleApiMock.mockReset();
  });

  it('creates scheduled automation rules with the expected payload', async () => {
    const user = userEvent.setup();
    createAutomationRuleApiMock.mockResolvedValue({
      id: 'rule-heartbeat',
      boardId: 'b1',
      name: 'Heartbeat assign',
      trigger: 'heartbeat',
      triggerConfig: { intervalValue: 2, intervalUnit: 'hours' },
      conditions: { listId: null, labelId: null },
      action: 'assign_member',
      actionConfig: { memberId: 'u2' },
      enabled: true,
      lastRunAt: null,
    });

    renderPanel();

    await user.click(screen.getByRole('button', { name: '+ Create automation rule' }));
    const form = screen.getByPlaceholderText('Rule name…').closest('div');
    if (!form) throw new Error('Automation form container not found.');

    await user.type(within(form).getByPlaceholderText('Rule name…'), 'Heartbeat assign');
    await user.selectOptions(within(form).getAllByRole('combobox')[0], 'heartbeat');
    await user.clear(within(form).getByRole('spinbutton'));
    await user.type(within(form).getByRole('spinbutton'), '2');
    await user.selectOptions(within(form).getAllByRole('combobox').at(-1)!, 'u2');
    await user.click(within(form).getByRole('button', { name: 'Create Rule' }));

    await waitFor(() => {
      expect(createAutomationRuleApiMock).toHaveBeenCalledWith({
        boardId: 'b1',
        name: 'Heartbeat assign',
        trigger: 'heartbeat',
        triggerConfig: { intervalValue: 2, intervalUnit: 'hours' },
        conditions: { listId: null, labelId: null },
        action: 'assign_member',
        actionConfig: { memberId: 'u2' },
        enabled: true,
      });
    });
  });
});
