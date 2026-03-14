import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardModal } from './CardModal';
import { AppProvider, initialState } from '../store';
import type { AppState } from '../types';

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
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
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
    expect(screen.getByRole('heading', { name: 'Labels' })).toBeInTheDocument();
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
  });
});
