import { expect, test } from '@playwright/test';

for (const width of [1280, 768, 390]) {
  test(`saves and clears default selections at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
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

    const created = await page.request.post('/api/workspaces', { data: { name: `Preferences ${width}px`, visibility: 'private' } });
    expect(created.status()).toBe(201);
    const workspace = await created.json() as { id: string };
    const boards: string[] = [];
    for (const title of ['Default board', 'Other board']) {
      const response = await page.request.post('/api/boards', { data: { title, workspaceId: workspace.id, color: '#315ddc' } });
      expect(response.status()).toBe(201);
      const board = await response.json() as { id: string };
      boards.push(board.id);
    }

    await page.goto('/');
    await page.getByRole('button', { name: 'Open profile menu' }).click();
    await page.getByRole('button', { name: /^Preferences/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Account menu' });
    const workspaceSelect = dialog.getByRole('combobox').nth(0);
    await workspaceSelect.selectOption(workspace.id);
    const boardSelect = dialog.getByRole('combobox').nth(1);
    await boardSelect.selectOption(boards[0]);

    async function save() {
      const pending = page.waitForResponse(response => response.url().endsWith('/api/auth/preferences') && response.request().method() === 'PATCH');
      await dialog.getByRole('button', { name: 'Save Preferences' }).click();
      const response = await pending;
      expect(response.status()).toBe(200);
      return response;
    }

    await save();
    await expect(boardSelect).toHaveValue(boards[0]);

    await boardSelect.selectOption('');
    const clearedBoard = await save();
    expect(clearedBoard.request().postDataJSON()).toMatchObject({ defaultWorkspaceId: workspace.id, defaultBoardId: null });
    expect((await clearedBoard.json()).user).toMatchObject({ defaultWorkspaceId: workspace.id, defaultBoardId: null });

    await boardSelect.selectOption(boards[0]);
    await save();
    await workspaceSelect.selectOption('');
    await dialog.getByRole('radio', { name: /Dark mode/ }).check();
    const clearedWorkspace = await save();
    expect(clearedWorkspace.request().postDataJSON()).toEqual({ themePreference: 'dark', defaultWorkspaceId: null, defaultBoardId: null });

    await page.reload();
    const session = await page.request.get('/api/auth/session');
    expect((await session.json()).user).toMatchObject({ themePreference: 'dark', defaultWorkspaceId: null, defaultBoardId: null });
    await page.getByRole('button', { name: 'Open profile menu' }).click();
    await page.getByRole('button', { name: /^Preferences/ }).click();
    await expect(workspaceSelect).toHaveValue('');
    await expect(dialog.getByRole('combobox')).toHaveCount(1);
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
  });
}
