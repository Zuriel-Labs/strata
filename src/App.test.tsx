import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { STORAGE_KEY, initialState } from './store';

function renderApp() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState));
  return render(<App />);
}

describe('App', () => {
  it('switches workspaces and boards from the sidebar', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.selectOptions(screen.getByDisplayValue('Acme Engineering'), 'w2');

    expect(screen.getAllByText('Q1 Campaign Plan')).toHaveLength(2);
  });

  it('adds a link attachment from the card modal', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByText('Implement OAuth2 login flow'));
    await user.type(screen.getByPlaceholderText('Paste link or cloud doc URL'), 'docs.example.com/auth');
    await user.click(screen.getByRole('button', { name: 'Attach' }));

    expect(screen.getByRole('link', { name: 'docs.example.com/auth' })).toBeInTheDocument();
  });

  it('adds comment activity to the active card', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByText('Set up CI/CD pipeline for monorepo'));
    await user.type(screen.getByPlaceholderText('Write a comment… (use @name to mention)'), 'Need a review from @Alex Chen');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(screen.getByText('Need a review from @Alex Chen')).toBeInTheDocument();
    expect(screen.getByText('Comments (2)')).toBeInTheDocument();
  });

  it('adds a new list to the board', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /add another list/i }));
    await user.type(screen.getByPlaceholderText('List title…'), 'Blocked');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText(/Blocked/)).toBeInTheDocument();
  });
});
