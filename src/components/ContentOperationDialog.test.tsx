import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProvider, initialState } from '../store';
import { ContentOperationDialog } from './ContentOperationDialog';

const { preview, commit, refresh } = vi.hoisted(() => ({ preview: vi.fn(), commit: vi.fn(), refresh: vi.fn() }));
vi.mock('../services/content', () => ({ previewContentOperation: preview, commitContentOperation: commit }));
vi.mock('../lib/auth-context', () => ({ useAuth: () => ({ refresh, canManageWorkspace: () => true, canManageBoard: () => true, canEditBoardCards: () => true }) }));
beforeEach(() => {
  preview.mockReset(); commit.mockReset(); refresh.mockReset();
  preview.mockResolvedValue({ planHash: 'plan', counts: { cards: 2 }, unresolvedMappings: [], warnings: [], expiresAt: '2099-01-01T00:00:00Z' });
  commit.mockResolvedValue({ resultIds: ['copy'], operationId: 'operation' });
});

it('cancels without preview or mutation and keeps focus trapped inside the dialog', async () => {
  const user = userEvent.setup(); const close = vi.fn();
  render(<AppProvider initialAppState={initialState}><ContentOperationDialog kind="board_copy" sourceId="b1" onClose={close} /></AppProvider>);
  expect(screen.getByRole('dialog', { name: 'Copy board' })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(close).toHaveBeenCalledOnce();
  expect(preview).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
});

it('requires preview, keeps a failed draft and retries with the same operation key', async () => {
  const user = userEvent.setup();
  commit.mockRejectedValueOnce(new TypeError('Network unavailable'));
  render(<AppProvider initialAppState={initialState}><ContentOperationDialog kind="board_copy" sourceId="b1" onClose={() => {}} /></AppProvider>);
  await user.clear(screen.getByLabelText('Copy title')); await user.type(screen.getByLabelText('Copy title'), 'My copy');
  expect(screen.getByRole('button', { name: 'Confirm copy' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Preview impact' }));
  await user.click(screen.getByRole('button', { name: 'Confirm copy' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
  expect(screen.getByLabelText('Copy title')).toHaveValue('My copy');
  await user.click(screen.getByRole('button', { name: 'Confirm copy' }));
  await waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
  expect(commit.mock.calls[0][1]).toBe(commit.mock.calls[1][1]);
});

it('requires typed DELETE after the fresh impact preview', async () => {
  const user = userEvent.setup();
  const state = { ...initialState, lists: initialState.lists.map(list => list.id === 'l1' ? { ...list, archived: true } : list) };
  render(<AppProvider initialAppState={state}><ContentOperationDialog kind="delete" resourceType="list" sourceId="l1" onClose={() => {}} /></AppProvider>);
  await user.click(screen.getByRole('button', { name: 'Preview impact' }));
  expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();
  await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
  await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
  await waitFor(() => expect(commit).toHaveBeenCalledOnce());
  expect(commit.mock.calls[0][0]).toMatchObject({ confirmation: 'DELETE', planHash: 'plan' });
});
