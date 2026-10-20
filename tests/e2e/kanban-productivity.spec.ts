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
  const membership = await page.request.put(`/api/admin/boards/${board.id}/members/u2`, { data: { role: 'member' } });
  expect(membership.ok(), `membership: ${membership.status()} ${await membership.text()}`).toBeTruthy();
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

function listOrder(page: Page) {
  return page.locator('[data-list-sortable-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-list-id')));
}

async function dragCard(page: Page, sourceCardId: string, targetCardId: string) {
  await beginCardDrag(page, sourceCardId, targetCardId);
  await page.mouse.up();
}

async function beginCardDrag(page: Page, sourceCardId: string, targetCardId: string) {
  const source = page.locator(`[data-card-id="${sourceCardId}"]`);
  const target = page.locator(`[data-card-id="${targetCardId}"]`);
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 12, sourceBox!.y + sourceBox!.height / 2 + 12, { steps: 3 });
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + 4, { steps: 12 });
}

async function dragCardToListEnd(page: Page, sourceCardId: string, targetListId: string) {
  const source = page.locator(`[data-card-id="${sourceCardId}"]`);
  const target = page.locator(`[data-list-id="${targetListId}"]`);
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 12, sourceBox!.y + sourceBox!.height / 2 + 12, { steps: 3 });
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height - 12, { steps: 12 });
  await page.mouse.up();
}

async function beginListDrag(page: Page, sourceListId: string, targetListId: string) {
  const source = page.locator(`[data-list-drag-handle="${sourceListId}"]`);
  const target = page.locator(`[data-list-id="${targetListId}"]`);
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 12, sourceBox!.y + sourceBox!.height / 2 + 4, { steps: 3 });
  await page.mouse.move(targetBox!.x + targetBox!.width - 12, targetBox!.y + 24, { steps: 16 });
}

test('sorts the complete list persistently and keeps whole-card pointer drag available afterward', async ({ page }) => {
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

  await dragCard(page, sortLane.cardIds[2], sortLane.cardIds[0]);
  await expect.poll(() => cardOrder(page, sortLane.id)).toEqual([
    sortLane.cardIds[2], sortLane.cardIds[0], sortLane.cardIds[1], sortLane.cardIds[3],
  ]);
});

test('supports pointer cross-lane reordering with persisted destination order', async ({ page }) => {
  await signIn(page);
  const fixture = await createBoardFixture(page, `Pointer acceptance ${suffix}`, [
    { title: 'Pointer source', cards: [`Pointer source ${suffix}`] },
    { title: 'Pointer target', cards: [`Pointer target ${suffix}`] },
  ]);
  const [sourceList, targetList] = fixture.lists;
  const sourceCard = page.locator(`[data-card-id="${sourceList.cardIds[0]}"]`);
  await sourceCard.click();
  await expect(page.locator('button').filter({ hasText: `Pointer source ${suffix}` }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Close card' }).click();

  await beginCardDrag(page, sourceList.cardIds[0], targetList.cardIds[0]);
  await expect(page.locator('[data-card-placeholder="true"]')).toHaveCount(1);
  await expect(page.locator(`[data-card-id="${sourceList.cardIds[0]}"]`)).toHaveAttribute('data-card-placeholder', 'true');
  const placeholderOpacity = await page.locator('[data-card-placeholder="true"]').evaluate(element => Number.parseFloat(element.ownerDocument.defaultView!.getComputedStyle(element).opacity));
  expect(placeholderOpacity).toBeLessThan(0.5);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Close card' })).toHaveCount(0);

  await expect.poll(() => cardOrder(page, sourceList.id)).toEqual([]);
  await page.reload();
  await selectBoard(page, fixture.boardId);
  await expect.poll(() => cardOrder(page, targetList.id)).toEqual([sourceList.cardIds[0], targetList.cardIds[0]]);
});

test('keeps the board rendered when a cross-lane drop becomes the destination third card', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.stack ?? error.message));
  await signIn(page);
  const fixture = await createBoardFixture(page, `Third-card regression ${suffix}`, [
    { title: 'Third-card source', cards: [`Incoming third ${suffix}`] },
    { title: 'Third-card target', cards: [`Existing first ${suffix}`, `Existing second ${suffix}`] },
  ]);
  const [sourceList, targetList] = fixture.lists;

  await dragCardToListEnd(page, sourceList.cardIds[0], targetList.id);

  await page.waitForTimeout(100);
  expect(pageErrors).toEqual([]);
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeVisible();
  await expect(page.locator(`[data-list-id="${targetList.id}"]`)).toBeVisible();
  await expect.poll(() => cardOrder(page, sourceList.id)).toEqual([]);
  await expect.poll(() => cardOrder(page, targetList.id)).toEqual([
    targetList.cardIds[0], targetList.cardIds[1], sourceList.cardIds[0],
  ]);
  await page.reload();
  await selectBoard(page, fixture.boardId);
  await expect.poll(() => cardOrder(page, targetList.id)).toEqual([
    targetList.cardIds[0], targetList.cardIds[1], sourceList.cardIds[0],
  ]);
});

for (const timezoneId of ['America/Los_Angeles', 'UTC', 'Pacific/Auckland']) {
  test(`shows the same date-only due date on the card and in the modal in ${timezoneId}`, async ({ browser }) => {
    const context = await browser.newContext({ timezoneId });
    const page = await context.newPage();
    try {
      await signIn(page);
      const fixture = await createBoardFixture(page, `Date-only ${timezoneId} ${suffix}`, [
        { title: 'Date lane', cards: [`Date card ${timezoneId} ${suffix}`] },
      ]);
      const cardId = fixture.lists[0].cardIds[0];
      const response = await page.request.patch(`/api/cards/${cardId}`, { data: { dueDate: '2026-08-27' } });
      expect(response.ok()).toBeTruthy();
      await page.reload();
      await selectBoard(page, fixture.boardId);

      const card = page.locator(`[data-card-id="${cardId}"]`);
      await expect(card).toContainText('Aug 27');
      await card.click();
      await expect(page.getByLabel('Card due date')).toHaveValue('2026-08-27');
    } finally {
      await context.close();
    }
  });
}

test('reorders swimlanes with a horizontal gap, lane preview, and persisted exact position', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page);
  const fixture = await createBoardFixture(page, `Lane ordering ${suffix}`, [
    { title: 'Lane alpha', cards: ['Alpha one'] },
    { title: 'Lane beta', cards: ['Beta one', 'Beta two'] },
    { title: 'Lane gamma', cards: [] },
    { title: 'Lane delta', cards: ['Delta one', 'Delta two', 'Delta three'] },
  ]);
  const [alpha, beta, gamma, delta] = fixture.lists;

  const reducedTransitionSeconds = await page.locator(`[data-list-id="${alpha.id}"]`).evaluate(element => {
    const view = element.ownerDocument.defaultView!;
    return Number.parseFloat(view.getComputedStyle(element).transitionDuration);
  });
  expect(reducedTransitionSeconds).toBeLessThanOrEqual(0.000001);
  await expect.poll(() => listOrder(page)).toEqual([alpha.id, beta.id, gamma.id, delta.id]);

  await beginListDrag(page, alpha.id, gamma.id);
  await expect(page.locator('[data-list-drag-overlay="true"]')).toBeVisible();
  await expect(page.locator(`[data-list-id="${alpha.id}"]`)).toHaveAttribute('data-list-placeholder', 'true');
  const placeholderOpacity = await page.locator(`[data-list-id="${alpha.id}"]`).evaluate(element => Number.parseFloat(element.ownerDocument.defaultView!.getComputedStyle(element).opacity));
  expect(placeholderOpacity).toBeLessThan(0.5);
  await expect.poll(() => listOrder(page)).toEqual([beta.id, gamma.id, alpha.id, delta.id]);
  await page.mouse.up();

  await expect.poll(() => listOrder(page)).toEqual([beta.id, gamma.id, alpha.id, delta.id]);
  await expect(page.locator(`[data-list-id="${alpha.id}"] input`)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'List actions for Lane alpha', exact: true })).toBeVisible();
  await page.reload();
  await selectBoard(page, fixture.boardId);
  await expect.poll(() => listOrder(page)).toEqual([beta.id, gamma.id, alpha.id, delta.id]);
});

test('restores the previous swimlane order when persistence fails', async ({ page }) => {
  await signIn(page);
  const fixture = await createBoardFixture(page, `Lane rollback ${suffix}`, [
    { title: 'Rollback alpha', cards: [] },
    { title: 'Rollback beta', cards: [] },
    { title: 'Rollback gamma', cards: [] },
  ]);
  const [alpha, beta, gamma] = fixture.lists;
  await page.route(`**/api/lists/${alpha.id}/move`, route => route.abort('failed'));

  await beginListDrag(page, alpha.id, gamma.id);
  await page.mouse.up();

  await expect(page.getByText('Swimlane order not saved', { exact: true })).toBeVisible();
  await expect.poll(() => listOrder(page)).toEqual([alpha.id, beta.id, gamma.id]);
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
  await expect(page.getByTestId('rich-text-description').locator('strong').first()).toContainText('Launch plan');
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Redo' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Labels', exact: true }).click();
  await page.getByRole('button', { name: 'Manage labels in card' }).click();
  await page.getByRole('button', { name: 'Add new label' }).click();
  await page.getByPlaceholder('Label name').last().fill(labelName);
  await page.waitForTimeout(5_500);
  await expect(page.getByPlaceholder('Label name').last()).toHaveValue(labelName);
  await page.getByRole('button', { name: 'Save labels' }).click();
  await expect(page.getByRole('button', { name: 'Manage labels in card' })).toBeVisible();
  await page.getByRole('button', { name: 'Close labels panel' }).click();
  await expect(page.getByRole('button', { name: labelName, exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Labels', exact: true }).click();
  await page.getByRole('button', { name: `${labelName} Added`, exact: true }).click();
  await expect(page.getByRole('button', { name: `${labelName} Add`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: labelName, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: `${labelName} Add`, exact: true }).click();
  await expect(page.getByRole('button', { name: `${labelName} Added`, exact: true })).toBeVisible();
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

  await expect(page.getByRole('heading', { name: 'Checklists' })).toBeVisible();
  await expect(page.getByText('Verify launch')).toBeVisible();

  await page.getByRole('button', { name: 'Manage current card' }).click();
  await page.getByRole('button', { name: 'Duplicate card' }).click();
  await expect(page.getByRole('button', { name: `${sourceTitle} (copy)`, exact: true })).toBeVisible();
  await expect(page.getByTestId('rich-text-description').locator('strong').first()).toContainText('Launch plan');
  await expect(page.getByRole('button', { name: labelName, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Feature', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'launch-brief.example' })).toBeVisible();
  await expect(page.locator('input[type="date"]')).toHaveValue('2026-09-15');
  await expect(page.getByRole('button', { name: 'Stop watching card' })).toBeVisible();
  await page.getByRole('button', { name: 'Add item to Release' }).click();
  await page.getByPlaceholder('Checklist item').fill('Copy-only verification');
  await page.getByRole('button', { name: 'Save checklist item' }).click();
  await expect(page.getByText('Copy-only verification')).toBeVisible();

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
  await expect(page.getByTestId('rich-text-description').locator('strong').first()).toContainText('Launch plan');
  await expect(page.getByText('Copy-only verification')).toHaveCount(0);
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

test('exposes card collaboration but not list administration to a Board Member', async ({ page }) => {
  await signIn(page, 'priya', 'Member12345!');
  const boardSelect = page.locator('header select').filter({ has: page.locator('option[value="b1"]') });
  if (await boardSelect.count()) await boardSelect.selectOption('b1');

  await page.getByRole('button', { name: 'List actions for Backlog' }).click();
  await expect(page.getByRole('button', { name: 'Copy list', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive list', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'List actions for Backlog' }).click();
  await page.locator('[data-card-id="c1"]').click();
  await page.getByRole('button', { name: 'Manage current card' }).click();
  await expect(page.getByRole('button', { name: 'Duplicate card' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Edit description' })).toBeVisible();
  await expect(page.getByText('Lint & typecheck')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add checklist' })).toBeVisible();
  await page.getByRole('button', { name: 'Labels', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Manage labels in card' })).toHaveCount(0);
});

test('projects archived lists once and permits board administrators to delete them with their cards', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 768, height: 600 });
  const fixture = await createBoardFixture(page, `Archive acceptance ${suffix}`, [
    { title: `Archived parent ${suffix}`, cards: [`Child card ${suffix}`] },
    { title: `Active parent ${suffix}`, cards: [`Independent archive ${suffix}`] },
  ]);
  const [archivedList, activeList] = fixture.lists;

  await page.getByRole('button', { name: `List actions for Archived parent ${suffix}` }).click();
  await page.getByRole('button', { name: 'Archive list' }).click();
  const archivedCard = await page.request.patch(`/api/cards/${activeList.cardIds[0]}`, { data: { archived: true } });
  expect(archivedCard.ok()).toBeTruthy();
  await page.reload();
  await selectBoard(page, fixture.boardId);

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByText(new RegExp(`Archived parent ${suffix}`))).toHaveCount(1);
  await expect(page.getByText(new RegExp(`Child card ${suffix}`))).toHaveCount(0);
  await expect(page.getByText(new RegExp(`Independent archive ${suffix}`))).toHaveCount(1);

  await page.getByRole('button', { name: `Delete archived list Archived parent ${suffix}` }).click();
  await expect(page.getByRole('dialog', { name: 'Permanently delete list' })).toBeVisible();
  await page.getByRole('button', { name: 'Preview impact' }).click();
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Delete permanently' })).toBeInViewport();
  const managementBounds = await page.getByTestId('management-dialog').boundingBox();
  expect(managementBounds).not.toBeNull();
  expect(managementBounds!.y + managementBounds!.height).toBeLessThanOrEqual(600);
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByText(new RegExp(`Archived parent ${suffix}`))).toHaveCount(0);
  await signIn(page);
  expect((await page.request.get(`/api/cards/${archivedList.cardIds[0]}`)).status()).toBe(404);
});

test.describe('touch board interaction', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 430, height: 932 } });

  test('moves a lane from a held title-area touch with the same preview treatment', async ({ page, context }) => {
    await signIn(page);
    const fixture = await createBoardFixture(page, `Touch lane ordering ${suffix}`, [
      { title: 'Touch lane alpha', cards: ['Touch alpha card'] },
      { title: 'Touch lane beta', cards: ['Touch beta card'] },
    ]);
    const [alpha, beta] = fixture.lists;
    const source = page.locator(`[data-list-drag-handle="${alpha.id}"]`);
    const target = page.locator(`[data-list-id="${beta.id}"]`);
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    const cdp = await context.newCDPSession(page);
    const start = { x: sourceBox!.x + sourceBox!.width / 2, y: sourceBox!.y + sourceBox!.height / 2 };
    const finish = { x: Math.min(420, targetBox!.x + 100), y: targetBox!.y + 24 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await page.waitForTimeout(350);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: (start.x + finish.x) / 2, y: start.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finish] });
    await expect(page.locator('[data-list-drag-overlay="true"]')).toBeVisible();
    await expect(page.locator(`[data-list-id="${alpha.id}"]`)).toHaveAttribute('data-list-placeholder', 'true');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect.poll(() => listOrder(page)).toEqual([beta.id, alpha.id]);
    await page.reload();
    await selectBoard(page, fixture.boardId);
    await expect.poll(() => listOrder(page)).toEqual([beta.id, alpha.id]);
  });

  test('opens on a tap release and drags from a held whole-card touch', async ({ page, context }) => {
    await signIn(page);
    const fixture = await createBoardFixture(page, `Touch acceptance ${suffix}`, [
      { title: 'Touch source', cards: [`Touch source ${suffix}`] },
      { title: 'Touch target', cards: [`Touch target ${suffix}`] },
    ]);
    const [sourceList, targetList] = fixture.lists;
    const sourceCard = page.locator(`[data-card-id="${sourceList.cardIds[0]}"]`);
    const targetCard = page.locator(`[data-card-id="${targetList.cardIds[0]}"]`);
    const sourceBox = await sourceCard.boundingBox();
    const targetBox = await targetCard.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    await page.touchscreen.tap(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await expect(page.getByRole('button', { name: 'Close card' })).toBeVisible();
    await page.getByRole('button', { name: 'Close card' }).click();

    const cdp = await context.newCDPSession(page);
    const start = { x: sourceBox!.x + sourceBox!.width / 2, y: sourceBox!.y + sourceBox!.height / 2 };
    const finish = { x: targetBox!.x + targetBox!.width / 2, y: targetBox!.y + 8 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await page.waitForTimeout(350);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: (start.x + finish.x) / 2, y: (start.y + finish.y) / 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finish] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect.poll(() => cardOrder(page, sourceList.id)).toEqual([]);
    await expect(page.getByRole('button', { name: 'Close card' })).toHaveCount(0);
    await page.reload();
    await selectBoard(page, fixture.boardId);
    await expect.poll(() => cardOrder(page, targetList.id)).toEqual([sourceList.cardIds[0], targetList.cardIds[0]]);
  });
});
