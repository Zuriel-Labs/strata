import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardView } from './BoardView';
import { AppProvider, initialState } from '../store';

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    canManageBoard: () => true,
    canManageBoardLabels: () => true,
    canEditBoardCards: () => true,
    canArchiveBoardContent: () => true,
  }),
}));

describe('BoardView', () => {
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
});
