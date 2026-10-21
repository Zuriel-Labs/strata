import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProvider, initialState } from '../store';
import { Header } from './Header';

const { manageBoard, manageWorkspace, preview, commit, refresh } = vi.hoisted(() => ({ manageBoard: vi.fn(() => true), manageWorkspace: vi.fn(() => true), preview: vi.fn(), commit: vi.fn(), refresh: vi.fn() }));
vi.mock('../lib/auth-context', () => ({ useAuth: () => ({
  session: { user: { color: '#6385f6', initials: 'AC' }, permissions: { isSystemAdmin: false } },
  canManageBoard: manageBoard, canManageWorkspace: manageWorkspace, canManageBoardLabels: () => false,
  canManageAutomation: () => false, refresh,
}) }));
vi.mock('../services/content', async () => ({ ...await vi.importActual<typeof import('../services/content')>('../services/content'), previewContentOperation: preview, commitContentOperation: commit }));
vi.mock('../services/collections', () => ({ fetchCollections: vi.fn(async () => ({ items: [] })) }));

beforeEach(() => { manageBoard.mockReturnValue(true); manageWorkspace.mockReturnValue(true); });

it('keeps board actions in a focused current-board window and out of Management', async () => {
  const user = userEvent.setup();
  render(<AppProvider initialAppState={initialState}><Header /></AppProvider>);
  expect(screen.queryByRole('button', { name: 'Copy board' })).not.toBeInTheDocument();
  const trigger = screen.getByRole('button', { name: 'Manage current board' });
  await user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Board management' });
  expect(within(dialog).getByText('Platform Sprint 24', { exact: true })).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Copy board' })).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Transfer board' })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Open navigation' }));
  await user.click(screen.getByRole('button', { name: 'Boards' }));
  expect(screen.getByRole('button', { name: '+ Add board' })).toBeInTheDocument();
  for (const name of ['Copy board', 'Transfer board', 'Convert to template', /Close board/]) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  }
});

it('retains read-only copy access while hiding administrator actions', async () => {
  manageBoard.mockReturnValue(false); manageWorkspace.mockReturnValue(false);
  const user = userEvent.setup();
  render(<AppProvider initialAppState={initialState}><Header /></AppProvider>);
  await user.click(screen.getByRole('button', { name: 'Manage current board' }));
  const dialog = screen.getByRole('dialog', { name: 'Board management' });
  expect(within(dialog).getByRole('button', { name: 'Copy board' })).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: 'Transfer board' })).not.toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: 'Convert to template' })).not.toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: /Close board/ })).not.toBeInTheDocument();
});

it('keeps closed-board deletion behind a fresh preview and typed confirmation in Board management', async () => {
  preview.mockResolvedValue({ planHash: 'plan', counts: { boards: 1 }, unresolvedMappings: [], warnings: [], expiresAt: '2099-01-01T00:00:00Z' });
  commit.mockResolvedValue({});
  const user = userEvent.setup();
  const state = { ...initialState, boards: initialState.boards.map(board => board.id === 'b1' ? { ...board, lifecycleState: 'closed' as const } : board) };
  render(<AppProvider initialAppState={state}><Header /></AppProvider>);
  await user.click(screen.getByRole('button', { name: 'Manage current board' }));
  expect(screen.getByRole('button', { name: 'Reopen board Platform Sprint 24' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Copy board' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Delete closed board' }));
  expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Preview impact' }));
  expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();
  await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
  await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
  expect(commit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'delete', resourceType: 'board', sourceId: 'b1' }), expect.any(String));
});
