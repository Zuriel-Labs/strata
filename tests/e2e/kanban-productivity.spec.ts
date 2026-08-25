import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

async function waitForServer(page: Page) {
  await expect.poll(async () => {
    try {
      return (await page.request.get('/api/health')).ok();
    } catch {
      return false;
    }
  }, { timeout: 30_000 }).toBeTruthy();
}

async function signIn(page: Page, username = 'alex', password = 'WorkspaceAdmin123!') {
  await waitForServer(page);
  await page.goto('/');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeVisible({ timeout: 10_000 });
}

async function postJson<T>(page: Page, path: string, data: unknown): Promise<T> {
  const response = await page.request.post(path, { data });
  expect(response.ok(), `${path}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

async function selectBoard(page: Page, boardId: string) {
  const boardSelect = page.locator('header select').filter({ has: page.locator(`option[value="${boardId}"]`) });
  await expect(boardSelect).toHaveCount(1);
  await boardSelect.selectOption(boardId);
}

async function createBoardFixture(page: Page, name: string, lists: Array<{ title: string; cards: string[] }>) {
  const board = await postJson<{ id: string; labels: Array<{ id: string; name: string; color: string }> }>(page, '/api/boards', {
    workspaceId: 'w1', title: name, color: '#3b82f6',
  });
  const createdLists: Array<{ id: string; title: string; cardIds: string[] }> = [];
  for (const fixture of lists) {
    const list = await postJson<{ id: string; title: string }>(page, '/api/lists', { boardId: board.id, title: fixture.title });
    const cardIds: string[] = [];
    for (const title of fixture.cards) {
      const card = await postJson<{ id: string }>(page, '/api/cards', { boardId: board.id, listId: list.id, title });
      cardIds.push(card.id);
    }
    createdLists.push({ ...list, cardIds });
  }

  await page.reload();
  await selectBoard(page, board.id);
  return { boardId: board.id, labels: board.labels, lists: createdLists };
}

function cardOrder(page: Page, listId: string) {
  return page.locator(`[data-list-id="${listId}"] [data-card-id]`).evaluateAll(elements => elements.map(element => element.getAttribute('data-card-id')));
}

test('sorts the complete list persistently and keeps manual keyboard drag available afterward', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page);
  const title = `Ordering acceptance ${suffix}`;
  const fixture = await createBoardFixture(page, title, [
    { title: 'Sort lane', cards: ['Zulu', 'item 10', 'Alpha', 'Item 2'] },
    { title: 'Single lane', cards: ['Only card'] },
    { title: 'Empty lane', cards: [] },
  ]);
  const [sortLane, singleLane, emptyLane] = fixture.lists;
  const reducedTransitionSeconds = await page.locator(`[data-card-id="${sortLane.cardIds[0]}"]`).evaluate(element => {
    const view = (element as unknown as { ownerDocument: { defaultView: { getComputedStyle: (node: unknown) => { transitionDuration: string } } } }).ownerDocument.defaultView;
    return Number.parseFloat(view.getComputedStyle(element).transitionDuration);
  });
  expect(reducedTransitionSeconds).toBeLessThanOrEqual(0.000001);

  const urgent = fixture.labels.find(label => label.name === 'Urgent')!;
  const labeled = await page.request.patch(`/api/cards/${sortLane.cardIds[0]}`, { data: { labelIds: [urgent.id] } });
  expect(labeled.ok()).toBeTruthy();
  await page.reload();
  await selectBoard(page, fixture.boardId);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('button', { name: 'Urgent', exact: true }).click();
  await expect.poll(() => cardOrder(page, sortLane.id)).toEqual([sortLane.cardIds[0]]);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();

  await page.getByRole('button', { name: 'List actions for Sort lane' }).click();
  await expect(page.getByRole('separator')).toBeVisible();
  await page.getByRole('button', { name: 'Sort A to Z' }).click();
  await expect.poll(() => cardOrder(page, sortLane.id)).toEqual([sortLane.cardIds[0]]);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('button', { name: 'Clear all filters' }).click();
  await expect.poll(() => cardOrder(page, sortLane.id)).toEqual([
    sortLane.cardIds[2], sortLane.cardIds[3], sortLane.cardIds[1], sortLane.cardIds[0],
  ]);

  await page.reload();
  await selectBoard(page, fixture.boardId);
  await expect.poll(() => cardOrder(page, sortLane.id)).toEqual([
    sortLane.cardIds[2], sortLane.cardIds[3], sortLane.cardIds[1], sortLane.cardIds[0],
  ]);

  await page.getByRole('button', { name: 'List actions for Sort lane' }).click();
  await page.getByRole('button', { name: 'Sort Z to A' }).click();
  await expect.poll(() => cardOrder(page, sortLane.id)).toEqual([
    sortLane.cardIds[0], sortLane.cardIds[1], sortLane.cardIds[3], sortLane.cardIds[2],
  ]);

  await page.getByRole('button', { name: 'List actions for Single lane' }).click();
  await page.getByRole('button', { name: 'Sort A to Z' }).click();
  await expect.poll(() => cardOrder(page, singleLane.id)).toEqual(singleLane.cardIds);
  await page.getByRole('button', { name: 'List actions for Empty lane' }).click();
  await page.getByRole('button', { name: 'Sort Z to A' }).click();
  await expect.poll(() => cardOrder(page, emptyLane.id)).toEqual([]);
  await page.getByRole('button', { name: 'List actions for Empty lane' }).click();
  await expect(page.getByRole('separator')).toBeVisible();
  await page.getByRole('button', { name: 'Archive list' }).click();
  await expect(page.locator(`[data-list-id="${emptyLane.id}"]`)).toHaveCount(0);

  const alphaHandle = page.getByRole('button', { name: 'Drag Alpha' });
  await alphaHandle.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await expect.poll(() => cardOrder(page, sortLane.id)).toEqual([
    sortLane.cardIds[0], sortLane.cardIds[1], sortLane.cardIds[2], sortLane.cardIds[3],
  ]);
});

test('supports pointer cross-lane reordering with persisted destination order', async ({ page }) => {
  await signIn(page);
  const fixture = await createBoardFixture(page, `Pointer acceptance ${suffix}`, [
    { title: 'Pointer source', cards: [`Pointer source ${suffix}`] },
    { title: 'Pointer target', cards: [`Pointer target ${suffix}`] },
  ]);
  const [sourceList, targetList] = fixture.lists;
  const sourceHandle = page.getByRole('button', { name: `Drag Pointer source ${suffix}` });
  const targetCard = page.locator(`[data-card-id="${targetList.cardIds[0]}"]`);
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetCard.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 12, sourceBox!.y + sourceBox!.height / 2 + 12, { steps: 3 });
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect.poll(() => cardOrder(page, sourceList.id)).toEqual([]);
  await page.reload();
  await selectBoard(page, fixture.boardId);
  await expect.poll(() => cardOrder(page, targetList.id)).toEqual([sourceList.cardIds[0], targetList.cardIds[0]]);
});

test('round-trips rich descriptions, manages labels in-card, and duplicates an independent card', async ({ page }) => {
  await signIn(page);
  const fixture = await createBoardFixture(page, `Card acceptance ${suffix}`, [
    { title: 'Card lane', cards: [`Productivity source ${suffix}`, `Following card ${suffix}`] },
  ]);
  const lane = fixture.lists[0];
  const sourceTitle = `Productivity source ${suffix}`;
  const labelName = `Launch ${suffix}`;
  const renamedLabel = `Release ${suffix}`;
  const automationLabel = fixture.labels.find(label => label.name === 'Feature')!;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText(sourceTitle, { exact: true }).click();
  await page.getByRole('button', { name: 'Edit description' }).click();
  const editor = page.getByRole('textbox', { name: 'Description editor' });
  await expect(page.getByRole('toolbar', { name: 'Description formatting' })).toBeVisible();
  await editor.fill('Launch plan\nSecond line');
  await editor.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.getByRole('button', { name: 'Bold' }).click();
  await page.getByRole('button', { name: 'Save description' }).click();
  await expect(page.getByRole('button', { name: 'Edit description' }).locator('strong').first()).toContainText('Launch plan');

  await page.getByRole('button', { name: 'Labels', exact: true }).click();
  await page.getByRole('button', { name: 'Manage labels in card' }).click();
  await page.getByRole('button', { name: 'Add new label' }).click();
  await page.getByPlaceholder('Label name').last().fill(labelName);
  await page.getByRole('button', { name: 'Save labels' }).click();
  await expect(page.getByRole('button', { name: 'Manage labels in card' })).toBeVisible();
  await page.getByRole('button', { name: 'Close labels panel' }).click();
  await expect(page.getByRole('button', { name: labelName, exact: true })).toBeVisible();

  await postJson(page, '/api/automation-rules', {
    boardId: fixture.boardId,
    name: `Label duplicates ${suffix}`,
    trigger: 'card_created',
    triggerConfig: {},
    conditions: { listId: null, labelId: null },
    action: 'add_label',
    actionConfig: { labelId: automationLabel.id },
    enabled: true,
  });
  const populated = await page.request.patch(`/api/cards/${lane.cardIds[0]}`, {
    data: {
      memberIds: ['u2'],
      dueDate: '2026-09-15T00:00:00.000Z',
      dueDateComplete: true,
      checklists: [{ id: 'e2e-checklist', title: 'Release', items: [{ id: 'e2e-item', text: 'Verify launch', completed: true }] }],
      attachments: [{ id: 'e2e-attachment', name: 'launch-brief.example', kind: 'link', url: 'https://launch-brief.example', createdAt: '2026-08-25T00:00:00.000Z' }],
      watching: true,
    },
  });
  expect(populated.ok()).toBeTruthy();
  await page.reload();
  await selectBoard(page, fixture.boardId);
  await page.getByText(sourceTitle, { exact: true }).click();

  await page.getByRole('button', { name: 'Duplicate card' }).click();
  await expect(page.getByRole('button', { name: `${sourceTitle} (copy)`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit description' }).locator('strong').first()).toContainText('Launch plan');
  await expect(page.getByRole('button', { name: labelName, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Feature', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'launch-brief.example' })).toBeVisible();
  await expect(page.locator('input[type="date"]')).toHaveValue('2026-09-15');
  await expect(page.getByRole('button', { name: 'Watch card' })).toBeVisible();

  await page.getByRole('button', { name: 'Labels', exact: true }).click();
  await page.getByRole('button', { name: 'Manage labels in card' }).click();
  await page.getByLabel(`Label name for ${labelName}`).fill(`Canceled ${suffix}`);
  await page.getByRole('button', { name: 'Cancel label changes' }).click();
  await expect(page.getByRole('button', { name: 'Manage labels in card' })).toBeVisible();
  await page.getByRole('button', { name: 'Manage labels in card' }).click();
  await expect(page.getByLabel(`Label name for ${labelName}`)).toHaveValue(labelName);
  await page.getByLabel(`Label name for ${labelName}`).fill(renamedLabel);
  await page.getByRole('button', { name: `Choose color for ${renamedLabel}` }).click();
  await page.getByRole('button', { name: 'Select #14b8a6' }).click();
  await page.getByRole('button', { name: 'Save labels' }).click();
  await expect(page.getByRole('button', { name: 'Manage labels in card' })).toBeVisible();
  await page.getByRole('button', { name: 'Close labels panel' }).click();
  await expect(page.getByRole('button', { name: renamedLabel, exact: true })).toHaveCSS('background-color', 'rgb(20, 184, 166)');

  await page.getByRole('button', { name: `${sourceTitle} (copy)`, exact: true }).click();
  const titleInput = page.getByLabel('Card title');
  await titleInput.fill(`Independent copy ${suffix}`);
  await titleInput.press('Enter');
  await page.getByRole('button', { name: 'Close card' }).click();

  await expect.poll(() => cardOrder(page, lane.id)).toEqual([lane.cardIds[0], expect.any(String), lane.cardIds[1]]);
  await page.reload();
  await selectBoard(page, fixture.boardId);
  await expect(page.getByText(sourceTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(`Independent copy ${suffix}`, { exact: true })).toBeVisible();
  await page.getByText(sourceTitle, { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit description' }).locator('strong').first()).toContainText('Launch plan');
  await expect(page.getByRole('button', { name: renamedLabel, exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Labels', exact: true }).click();
  await page.getByRole('button', { name: 'Manage labels in card' }).click();
  await page.getByRole('button', { name: `Delete ${renamedLabel}` }).click();
  await expect(page.getByRole('alertdialog')).toContainText('This removes the shared label from 2 cards');
  await page.getByRole('button', { name: 'Confirm delete label' }).click();
  await page.getByRole('button', { name: 'Save labels' }).click();
  await expect(page.getByRole('button', { name: 'Manage labels in card' })).toBeVisible();
  await page.getByRole('button', { name: 'Close labels panel' }).click();
  await expect(page.getByRole('button', { name: renamedLabel, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close card' }).click();
  await page.getByText(`Independent copy ${suffix}`, { exact: true }).click();
  await expect(page.getByRole('button', { name: renamedLabel, exact: true })).toHaveCount(0);
});

test('hides mutation controls from a read-only board member', async ({ page }) => {
  await signIn(page, 'priya', 'Member12345!');
  const boardSelect = page.locator('header select').filter({ has: page.locator('option[value="b1"]') });
  if (await boardSelect.count()) await boardSelect.selectOption('b1');

  await expect(page.getByRole('button', { name: 'List actions for Backlog' })).toHaveCount(0);
  await page.locator('[data-card-id="c5"]').click();
  await expect(page.getByRole('button', { name: 'Duplicate card' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit description' })).toBeDisabled();
  await page.getByRole('button', { name: 'Labels', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Manage labels in card' })).toHaveCount(0);
});
