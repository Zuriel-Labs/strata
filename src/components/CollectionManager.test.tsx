import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProvider, initialState } from '../store';
import { CollectionManager } from './CollectionManager';

const { fetchPage, create, refresh } = vi.hoisted(() => ({ fetchPage: vi.fn(), create: vi.fn(), refresh: vi.fn() }));
vi.mock('../services/collections', () => ({ fetchCollections: fetchPage, createCollection: create }));
vi.mock('../lib/auth-context', () => ({ useAuth: () => ({ refresh, canManageWorkspace: () => true }) }));

it('keeps a newly created collection selected when its ID falls beyond the first page', async () => {
  const user = userEvent.setup();
  const first = { id: 'first', workspaceId: 'w1', name: 'Existing', revision: 0, boardIds: [] };
  const created = { ...first, id: 'last', name: 'Created' };
  fetchPage.mockImplementation(async (_workspace: string, cursor?: string) => cursor ? { items: [created], nextCursor: null } : { items: [first], nextCursor: 'next' });
  create.mockResolvedValue(created);
  render(<AppProvider initialAppState={initialState}><CollectionManager workspaceId="w1" /></AppProvider>);
  await screen.findByRole('option', { name: 'Existing' });
  await user.type(screen.getByLabelText('Collection name'), 'Created');
  await user.click(screen.getByRole('button', { name: 'Create collection' }));
  expect(await screen.findByRole('button', { name: 'Rename collection' })).toBeInTheDocument();
  expect(screen.getByRole('combobox')).toHaveValue('last');
});
