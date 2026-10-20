import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username').fill('alex');
  await page.getByLabel('Password').fill('WorkspaceAdmin123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeVisible();
}
async function fixture(page: Page) {
  const suffix = crypto.randomUUID();
  const boardResponse = await page.request.post('/api/boards', { data: { workspaceId: 'w1', title: `Lifecycle ${suffix}`, color: '#6366f1' } });
  expect(boardResponse.status()).toBe(201);
  const board = await boardResponse.json() as { id: string; title: string };
  const listResponse = await page.request.post('/api/lists', { data: { boardId: board.id, title: `Lane ${suffix}` } });
  const list = await listResponse.json() as { id: string; title: string };
  const cardResponse = await page.request.post('/api/cards', { data: { boardId: board.id, listId: list.id, title: `Card ${suffix}` } });
  const card = await cardResponse.json() as { id: string; title: string };
  await page.reload();
  await page.locator('header select').filter({ has: page.locator(`option[value="${board.id}"]`) }).selectOption(board.id);
  return { board, list, card, suffix };
}
async function bootstrap(page: Page) {
  const response = await page.request.get('/api/workspaces/bootstrap');
  expect(response.status()).toBe(200);
  return response.json();
}

for (const width of [320, 768, 1440]) test(`copies through a focused responsive dialog and retains a recoverable draft at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await signIn(page);
  const { board } = await fixture(page);
  await expect(page.getByRole('button', { name: 'Copy board', exact: true })).toHaveCount(0);
  const managerTrigger = page.getByRole('button', { name: 'Manage current board' });
  const headerBounds = await page.locator('header').boundingBox();
  expect(headerBounds!.height).toBeLessThanOrEqual(160);
  await page.screenshot({ path: testInfo.outputPath('board-toolbar.png'), animations: 'disabled' });
  await managerTrigger.click();
  const manager = page.getByRole('dialog', { name: 'Board management', exact: true });
  await expect(manager.getByText(board.title, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('board-management.png'), animations: 'disabled' });
  await page.keyboard.press('Tab');
  expect(await manager.evaluate(element => element.contains(element.ownerDocument.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(managerTrigger).toBeFocused();
  await managerTrigger.click();
  const trigger = page.getByRole('button', { name: 'Copy board', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Copy board', exact: true });
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(element => element.contains(element.ownerDocument.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  const title = `Independent ${crypto.randomUUID()}`;
  await dialog.getByLabel('Copy title').fill(title);
  await page.route('**/api/content-operations/preview', route => route.abort('failed'));
  await dialog.getByRole('button', { name: 'Preview impact' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Copy title')).toHaveValue(title);
  await page.unroute('**/api/content-operations/preview');
  await dialog.getByRole('button', { name: 'Preview impact' }).click();
  await expect(dialog.getByRole('region', { name: 'Impact preview' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('copy-preview.png') });
  await dialog.getByRole('button', { name: 'Confirm copy' }).click();
  await expect(dialog).toHaveCount(0);
  const state = (await bootstrap(page)).appState;
  const copy = state.boards.find((item: { title: string }) => item.title === title);
  expect(copy.id).not.toBe(board.id);
  const originalCards = state.cards.filter((item: { boardId: string }) => item.boardId === board.id);
  const copiedCards = state.cards.filter((item: { boardId: string }) => item.boardId === copy.id);
  expect(copiedCards).toHaveLength(originalCards.length);
  expect(copiedCards[0].id).not.toBe(originalCards[0].id);
});

test('persists personal collapse and shared color, manages a collection, and recovers a closed board', async ({ page }) => {
  await signIn(page);
  const { board, list } = await fixture(page);
  await page.getByRole('button', { name: `Collapse ${list.title} (1 cards)` }).click();
  await page.reload();
  await page.locator('header select').filter({ has: page.locator(`option[value="${board.id}"]`) }).selectOption(board.id);
  await expect(page.getByRole('button', { name: `Expand ${list.title} (1 cards)` })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: `Expand ${list.title} (1 cards)` }).click();
  await page.getByRole('button', { name: `List actions for ${list.title}` }).click();
  await page.getByRole('button', { name: 'List color', exact: true }).click();
  await page.getByRole('dialog', { name: 'List color', exact: true }).getByLabel('Color', { exact: true }).selectOption('#059669');
  await page.getByRole('button', { name: 'Save color' }).click();
  await expect.poll(async () => (await bootstrap(page)).appState.lists.find((item: { id: string }) => item.id === list.id).color).toBe('#059669');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Boards', exact: true }).click();
  const collections = page.getByRole('region', { name: 'Board collections' });
  const name = `Group ${crypto.randomUUID()}`;
  await collections.getByLabel('Collection name').fill(name);
  await collections.getByRole('button', { name: 'Create collection', exact: true }).click();
  await expect(collections.getByRole('button', { name: 'Rename collection' })).toBeVisible();
  await collections.getByLabel(board.title, { exact: true }).click();
  await expect(collections.getByLabel(board.title, { exact: true })).toBeChecked();
  await page.keyboard.press('Escape');
  for (const name of ['Copy board', 'Transfer board', 'Convert to template', `Close board ${board.title}`]) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Manage current board' }).click();
  await page.getByRole('button', { name: `Close board ${board.title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Reopen board ${board.title}`, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Add a list', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Manage current board' }).click();
  expect((await page.request.post('/api/cards', { data: { boardId: board.id, listId: list.id, title: 'Blocked' } })).status()).toBe(409);
  await page.getByRole('button', { name: `Reopen board ${board.title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Close board ${board.title}`, exact: true })).toBeVisible();
});


test('moves cards and complete lists across boards through explicit mapping previews', async ({ page }) => {
  await signIn(page);
  const { board, list, card } = await fixture(page);
  const destination = await (await page.request.post('/api/boards', { data: { workspaceId: 'w1', title: `Destination ${crypto.randomUUID()}`, color: '#059669' } })).json();
  const destinationList = await (await page.request.post('/api/lists', { data: { boardId: destination.id, title: 'Arrival' } })).json();
  const labels = (await bootstrap(page)).appState.boards.find((item: { id: string }) => item.id === board.id).labels;
  await page.request.patch(`/api/cards/${card.id}`, { data: { labelIds: [labels[0].id] } });
  await page.reload();
  await page.locator('header select').filter({ has: page.locator(`option[value="${board.id}"]`) }).selectOption(board.id);
  await page.locator(`[data-card-id="${card.id}"]`).click();
  await page.getByRole('button', { name: 'Transfer card', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Move card', exact: true });
  await dialog.getByLabel('Destination board', { exact: true }).selectOption(destination.id);
  await dialog.getByLabel('Destination list', { exact: true }).selectOption(destinationList.id);
  await dialog.getByLabel(`Map label ${labels[0].name}`, { exact: true }).selectOption('__drop');
  await dialog.getByRole('button', { name: 'Preview impact' }).click();
  await dialog.getByRole('button', { name: 'Confirm move' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await bootstrap(page)).appState.cards.find((item: { id: string }) => item.id === card.id).boardId).toBe(destination.id);
  expect((await bootstrap(page)).appState.cards.find((item: { id: string }) => item.id === card.id).labelIds).toEqual([]);
  await expect(page.getByRole('button', { name: 'Close card' })).toHaveCount(0);
  const retained = await (await page.request.post('/api/cards', { data: { boardId: board.id, listId: list.id, title: 'Retained identity' } })).json();
  await page.request.patch(`/api/cards/${retained.id}`, { data: { archived: true } });
  await page.reload();
  await page.locator('header select').filter({ has: page.locator(`option[value="${board.id}"]`) }).selectOption(board.id);
  await page.getByRole('button', { name: `List actions for ${list.title}` }).click();
  await page.getByRole('button', { name: 'Move list', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Move list', exact: true });
  await dialog.getByLabel('Destination board', { exact: true }).selectOption(destination.id);
  await dialog.getByRole('button', { name: 'Preview impact' }).click();
  await dialog.getByRole('button', { name: 'Confirm move' }).click();
  await expect(dialog).toHaveCount(0);
  const state = (await bootstrap(page)).appState;
  expect(state.lists.find((item: { id: string }) => item.id === list.id).boardId).toBe(destination.id);
  expect(state.cards.find((item: { id: string }) => item.id === retained.id)).toMatchObject({ boardId: destination.id, listId: list.id, archived: true });
});

test('creates a private template and independent instances through board copy', async ({ page }) => {
  await signIn(page);
  const { board } = await fixture(page);
  await page.getByRole('button', { name: 'Manage current board' }).click();
  await page.getByRole('button', { name: 'Convert to template', exact: true }).click();
  await expect(page.getByText('Private template', { exact: true }).first()).toBeVisible();
  for (let index = 0; index < 2; index++) {
    await page.getByRole('button', { name: 'Copy board', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Copy board', exact: true });
    await dialog.getByLabel('Copy title').fill(`${board.title} instance ${index}`);
    await dialog.getByRole('button', { name: 'Preview impact' }).click();
    await dialog.getByRole('button', { name: 'Confirm copy' }).click();
    await expect(dialog).toHaveCount(0);
  }
  const state = (await bootstrap(page)).appState;
  const instances = state.boards.filter((item: { title: string }) => item.title.startsWith(`${board.title} instance`));
  expect(instances).toHaveLength(2);
  expect(instances.every((item: { isTemplate: boolean; visibility: string }) => !item.isTemplate && item.visibility === 'private')).toBe(true);
  const cards = instances.map((item: { id: string }) => state.cards.find((card: { boardId: string }) => card.boardId === item.id));
  expect(cards[0].id).not.toBe(cards[1].id);
  expect(cards[0]).toMatchObject({ memberIds: [], comments: [], watching: false });
});


test('previews board audience changes and transfers the same graph between workspaces', async ({ page }) => {
  let login = await page.request.post('/api/auth/login', { data: { username: 'admin', password: 'ChangeThisNow123!' } });
  if (login.status() === 401) {
    login = await page.request.post('/api/auth/login', { data: { username: 'admin', password: 'ChangeMe123!' } });
    expect(login.status()).toBe(200);
    expect((await page.request.post('/api/auth/password/change', { data: { currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!', confirmPassword: 'ChangeThisNow123!' } })).status()).toBe(204);
  }
  await page.goto('/');
  const { board, list, card } = await fixture(page);
  const workspace = await (await page.request.post('/api/workspaces', { data: { name: `Transfer ${crypto.randomUUID()}` } })).json();
  await page.reload();
  await page.locator('header select').filter({ has: page.locator(`option[value="${board.id}"]`) }).selectOption(board.id);
  await page.getByRole('button', { name: 'Manage current board' }).click();
  await page.getByRole('button', { name: 'Transfer board', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Move board', exact: true });
  await dialog.getByLabel('Destination workspace', { exact: true }).selectOption(workspace.id);
  await dialog.getByRole('button', { name: 'Preview impact' }).click();
  await expect(dialog.getByText(/^administrators Lost:/)).toContainText('Alex Chen');
  await dialog.getByRole('button', { name: 'Confirm move' }).click();
  await expect(page.getByLabel('Username')).toBeVisible();
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('ChangeThisNow123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeVisible();
  const state = (await bootstrap(page)).appState;
  expect(state.boards.find((item: { id: string }) => item.id === board.id).workspaceId).toBe(workspace.id);
  expect(state.lists.find((item: { id: string }) => item.id === list.id).boardId).toBe(board.id);
  expect(state.cards.find((item: { id: string }) => item.id === card.id).listId).toBe(list.id);
});
