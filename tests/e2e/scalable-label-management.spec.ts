import { expect, test, type Page } from '@playwright/test';

async function authenticateSystemAdmin(page: Page) {
  let login = await page.request.post('/api/auth/login', { data: { username: 'admin', password: 'ChangeThisNow123!' } });
  if (login.status() === 401) {
    login = await page.request.post('/api/auth/login', { data: { username: 'admin', password: 'ChangeMe123!' } });
    expect(login.ok()).toBeTruthy();
    const changed = await page.request.post('/api/auth/password/change', {
      data: { currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!', confirmPassword: 'ChangeThisNow123!' },
    });
    expect(changed.ok()).toBeTruthy();
  }
  expect(login.ok()).toBeTruthy();
}

test('sixth labels remain independent and the System Admin limit controls every label entry point', async ({ page }) => {
  await authenticateSystemAdmin(page);
  const title = `Scalable labels ${Date.now()}`;
  const initialLabels = [
    { id: 'scale-e2e-1', name: 'Website', color: '#8b5cf6' },
    { id: 'scale-e2e-2', name: 'Mobile App', color: '#f97316' },
    { id: 'id_101', name: 'Persisted third label', color: '#ef4444' },
    { id: 'scale-e2e-4', name: 'Planning', color: '#f59e0b' },
    { id: 'scale-e2e-5', name: 'Communication', color: '#84cc16' },
  ];
  const createdResponse = await page.request.post('/api/boards', { data: { workspaceId: 'w1', title, color: '#3b82f6', labels: initialLabels } });
  expect(createdResponse.ok()).toBeTruthy();
  const created = await createdResponse.json() as { id: string };

  await page.goto('/');
  const boardSelect = page.locator('header select').nth(1);
  await boardSelect.selectOption(created.id);
  await page.getByRole('button', { name: 'Manage board labels' }).click();
  await page.getByRole('button', { name: 'Add new label' }).click();
  const sixthInput = page.getByPlaceholder('Label name').last();
  await sixthInput.fill('Independent sixth label');
  await page.getByLabel('Choose color for Independent sixth label').click();
  await page.getByLabel('Select #3b82f6').click();
  await page.getByRole('button', { name: 'Save labels' }).click();
  await expect(page.getByRole('dialog', { name: 'Board labels' })).toBeHidden();

  const session = await (await page.request.get('/api/auth/session')).json() as { appState: { boards: Array<{ id: string; labels: typeof initialLabels; labelsRevision: number }> } };
  const board = session.appState.boards.find(candidate => candidate.id === created.id)!;
  expect(board.labels.find(label => label.id === 'id_101')?.name).toBe('Persisted third label');
  const sixth = board.labels.find(label => label.name === 'Independent sixth label')!;
  expect(sixth.id).not.toBe('id_101');
  expect(sixth.color).toBe('#3b82f6');

  const twelve = [...board.labels, ...Array.from({ length: 6 }, (_, index) => ({ id: `scale-e2e-extra-${index}`, name: `Extra ${index + 1}`, color: '#14b8a6' }))];
  const filled = await page.request.put(`/api/boards/${created.id}/labels`, { data: { labels: twelve, expectedRevision: board.labelsRevision } });
  expect(filled.ok()).toBeTruthy();
  await page.reload(); await boardSelect.selectOption(created.id);
  await page.getByRole('button', { name: 'Manage board labels' }).click();
  await expect(page.getByText(/12 of 12 labels used/i)).toBeVisible();
  const addButton = page.getByRole('button', { name: 'Add new label' });
  await expect(addButton).toBeDisabled();
  expect((await addButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'Close label manager' }).click();

  await page.getByRole('button', { name: 'Open admin panel' }).click();
  await page.getByRole('button', { name: 'System Settings' }).click();
  const policyInput = page.getByLabel('Maximum labels per Board');
  await policyInput.fill('15');
  await page.getByRole('button', { name: 'Save label policy' }).click();
  await expect(page.getByText(/Saved\./)).toBeVisible();
  await page.getByText('Close', { exact: true }).click();

  await page.getByRole('button', { name: 'Manage board labels' }).click();
  await expect(page.getByText(/12 of 15 labels used/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add new label' })).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel label changes' }).click();

  await page.request.patch('/api/admin/settings/label-policy', { data: { maxLabelsPerBoard: 12 } });
  await page.request.delete(`/api/boards/${created.id}`);
});
