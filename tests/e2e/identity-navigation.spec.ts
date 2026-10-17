import { expect, test } from '@playwright/test';

for (const width of [320, 768, 1440]) {
  test(`search and account keyboard focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    expect((await page.request.post('/api/auth/login', { data: { username: 'alex', password: 'WorkspaceAdmin123!' } })).status()).toBe(200);
    await page.goto('/');
    const searchTrigger = page.getByRole('button', { name: 'Open search' });
    await searchTrigger.focus();
    await page.keyboard.press('Control+k');
    const search = page.getByRole('dialog', { name: 'Search cards' });
    const query = search.getByRole('textbox', { name: 'Search cards' });
    await expect(query).toBeFocused();
    await query.fill('No matching card for keyboard focus');
    await page.keyboard.press('Control+k');
    await expect(query).toBeFocused();
    await expect(query).toHaveValue('No matching card for keyboard focus');
    await page.keyboard.press('Shift+Tab');
    await expect(search.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(query).toBeFocused();
    const searchBounds = await search.boundingBox();
    expect(searchBounds?.x).toBeGreaterThanOrEqual(0);
    expect((searchBounds?.x ?? 0) + (searchBounds?.width ?? 0)).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(searchTrigger).toBeFocused();

    const accountTrigger = page.getByRole('button', { name: 'Open profile menu' });
    await accountTrigger.click();
    const account = page.getByRole('dialog', { name: 'Account menu' });
    await account.getByRole('button', { name: /^Preferences/ }).click();
    const back = account.getByRole('button', { name: 'Back to account menu' });
    await expect(back).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(account.getByRole('button', { name: 'Save Preferences' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(back).toBeFocused();
    const bounds = await account.boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(account.getByRole('button', { name: /^Preferences/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(accountTrigger).toBeFocused();
  });
}

test('password rotation and anonymous recovery invalidate old browser sessions', async ({ page, browser, baseURL }) => {
  let admin = await page.request.post('/api/auth/login', { data: { username: 'admin', password: 'ChangeThisNow123!' } });
  if (admin.status() === 401) {
    admin = await page.request.post('/api/auth/login', { data: { username: 'admin', password: 'ChangeMe123!' } });
    expect(admin.status()).toBe(200);
    expect((await page.request.post('/api/auth/password/change', { data: {
      currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!', confirmPassword: 'ChangeThisNow123!',
    } })).status()).toBe(204);
  }
  expect(admin.status()).toBe(200);
  const username = `credential-${Date.now()}`;
  const created = await page.request.post('/api/admin/users', { data: {
    username, name: 'Credential browser test', initials: 'CB', color: '#315ddc', platformRole: 'user', active: true,
    boardMemberships: [], workspaceMemberships: [],
  } });
  expect(created.status()).toBe(201);
  const account = await created.json() as { inviteToken: string };
  const activated = await page.request.post('/api/auth/recovery-key/consume', { data: {
    username, recoveryKey: account.inviteToken, newPassword: 'InitialBrowserPassword123!', confirmPassword: 'InitialBrowserPassword123!',
  } });
  expect(activated.status()).toBe(200);
  const activation = await activated.json() as { newRecoveryKey: string };
  await page.request.post('/api/auth/logout');
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('InitialBrowserPassword123!');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const other = await browser.newContext({ baseURL });
  try {
    expect((await other.request.post('/api/auth/login', { data: { username, password: 'InitialBrowserPassword123!' } })).status()).toBe(200);
    const before = (await page.context().cookies()).find(cookie => cookie.name === 'strata_session');
    await page.getByRole('button', { name: 'Open profile menu' }).click();
    await page.getByRole('button', { name: /^Security/ }).click();
    await page.getByLabel('Current password').fill('InitialBrowserPassword123!');
    await page.getByLabel('New password', { exact: true }).fill('ChangedBrowserPassword123!');
    await page.getByLabel('Confirm new password').fill('ChangedBrowserPassword123!');
    await page.getByRole('button', { name: 'Change', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Account menu' }).getByRole('status')).toHaveText('Password changed successfully.');
    const after = (await page.context().cookies()).find(cookie => cookie.name === 'strata_session');
    expect(Boolean(before && after && before.value !== after.value)).toBe(true);
    expect((await page.request.get('/api/auth/session')).status()).toBe(200);
    expect((await other.request.get('/api/auth/session')).status()).toBe(401);
    await page.getByRole('button', { name: 'Back to account menu' }).click();
    await page.getByRole('button', { name: /^Sign Out/ }).click();
    expect((await other.request.post('/api/auth/login', { data: { username, password: 'ChangedBrowserPassword123!' } })).status()).toBe(200);

    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.getByLabel('Recovery key', { exact: true }).fill(activation.newRecoveryKey);
    await page.getByLabel('New password', { exact: true }).fill('RecoveredBrowserPassword123!');
    await page.getByLabel('Confirm new password').fill('RecoveredBrowserPassword123!');
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByRole('button', { name: 'Proceed to Login' })).toBeVisible();
    expect((await other.request.get('/api/auth/session')).status()).toBe(401);
    expect((await page.request.get('/api/auth/session')).status()).toBe(401);
    const replay = await page.request.post('/api/auth/recovery-key/consume', { data: {
      username, recoveryKey: activation.newRecoveryKey, newPassword: 'RejectedReplayPassword123!', confirmPassword: 'RejectedReplayPassword123!',
    } });
    expect(replay.status()).toBe(401);
    expect((await replay.json()).code).toBe('RECOVERY_INVALID');
    await page.getByRole('button', { name: 'Proceed to Login' }).click();
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.getByLabel('Password', { exact: true }).fill('RecoveredBrowserPassword123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeVisible();
  } finally {
    await other.close();
  }
});
