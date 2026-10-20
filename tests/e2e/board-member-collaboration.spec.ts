import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeVisible({ timeout: 10_000 });
}

async function signOut(page: Page) {
  const response = await page.request.post('/api/auth/logout');
  expect(response.ok()).toBeTruthy();
  await page.goto('/');
  await expect(page.getByLabel('Username')).toBeVisible();
}

async function selectBoard(page: Page, boardId: string) {
  const boardSelect = page.locator('header select').filter({ has: page.locator(`option[value="${boardId}"]`) });
  if (await boardSelect.count()) await boardSelect.selectOption(boardId);
}

async function dragCardBefore(page: Page, sourceCardId: string, targetCardId: string) {
  const source = page.locator(`[data-card-id="${sourceCardId}"]`);
  const target = page.locator(`[data-card-id="${targetCardId}"]`);
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 12, sourceBox!.y + sourceBox!.height / 2 + 12, { steps: 3 });
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 10 });
  await page.mouse.up();
}

test('Board Members collaborate on cards while administrators moderate comments and edit automations', async ({ page }) => {
  await signIn(page, 'priya', 'Member12345!');
  await selectBoard(page, 'b1');

  const firstResponse = await page.request.post('/api/cards', { data: { boardId: 'b1', listId: 'l1', title: `Member first ${suffix}` } });
  const secondResponse = await page.request.post('/api/cards', { data: { boardId: 'b1', listId: 'l1', title: `Member second ${suffix}` } });
  expect(firstResponse.status()).toBe(201);
  expect(secondResponse.status()).toBe(201);
  const first = await firstResponse.json() as { id: string };
  const second = await secondResponse.json() as { id: string };

  await page.reload();
  await selectBoard(page, 'b1');
  await expect(page.getByRole('button', { name: 'List actions for Backlog' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ Add a card' }).first()).toBeVisible();

  await dragCardBefore(page, first.id, second.id);
  await expect.poll(async () => {
    const cards = await page.request.get('/api/auth/session').then(response => response.json()) as { appState: { cards: Array<{ id: string; position: number }> } };
    return cards.appState.cards.filter(card => card.id === first.id || card.id === second.id).sort((left, right) => left.position - right.position).map(card => card.id);
  }).toEqual([second.id, first.id]);

  await page.locator(`[data-card-id="${first.id}"]`).click();
  await page.getByRole('button', { name: 'Manage current card' }).click();
  await expect(page.getByRole('button', { name: 'Duplicate card' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Edit description' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add checklist' })).toBeVisible();
  await expect(page.getByLabel('Watch card')).toBeVisible();
  await page.getByLabel('Watch card').click();
  await expect(page.getByLabel('Stop watching card')).toBeVisible();

  const commentText = `Member comment ${suffix}`;
  const editedCommentText = `Edited member comment ${suffix}`;
  await page.getByPlaceholder('Write a comment...').fill(commentText);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(commentText, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Edit comment ${commentText}` }).click();
  await page.getByRole('textbox', { name: 'Edit comment' }).fill(editedCommentText);
  await page.getByRole('button', { name: 'Save comment' }).click();
  await expect(page.getByText(editedCommentText, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Delete comment ${editedCommentText}` })).toHaveCount(0);

  await page.getByRole('button', { name: 'Manage current card' }).click();
  await page.getByRole('button', { name: 'Duplicate card' }).click();
  await expect(page.getByText('Card duplicated', { exact: true })).toBeVisible();
  await expect(page.locator('button').filter({ hasText: `Member first ${suffix} (copy)` }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Close card' }).click();

  await signOut(page);
  await signIn(page, 'alex', 'WorkspaceAdmin123!');
  await selectBoard(page, 'b1');
  await page.locator(`[data-card-id="${first.id}"]`).click();
  await page.getByRole('button', { name: `Delete comment ${editedCommentText}` }).click();
  await expect(page.getByText(editedCommentText, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close card' }).click();

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Automations' }).click();
  const existingName = 'Mark due date complete on Done';
  const updatedName = `Admin automation edit ${suffix}`;
  await page.getByRole('button', { name: `Edit automation ${existingName}` }).click();
  await page.getByPlaceholder('Rule name…').fill(updatedName);
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { name: updatedName })).toBeVisible();
});
