import { expect, test } from '@playwright/test';

test('mvp flow works end to end', async ({ page }) => {
  // Wait for server readiness
  await expect.poll(async () => {
    try {
      const response = await page.request.get('http://127.0.0.1:8788/api/health');
      return response.ok();
    } catch {
      return false;
    }
  }, { timeout: 30000 }).toBeTruthy();

  await page.goto('/');

  // --- Login with fresh admin (requires password change) ---
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('ChangeMe123!');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Fresh seed → must change password
  await expect(page.getByLabel('Current password')).toBeVisible({ timeout: 10000 });
  await page.getByLabel('Current password').fill('ChangeMe123!');
  await page.getByLabel('New password', { exact: true }).fill('ChangeThisNow123!');
  await page.getByLabel('Confirm new password').fill('ChangeThisNow123!');
  await page.getByRole('button', { name: 'Update password' }).click();

  // --- Empty workspace selection remains isolated through auto-refresh ---
  const emptyWorkspaceName = `Empty workspace ${Date.now()}`;
  const emptyWorkspaceResponse = await page.request.post('/api/workspaces', {
    data: { name: emptyWorkspaceName, description: 'Session refresh isolation', visibility: 'private' },
  });
  expect(emptyWorkspaceResponse.ok()).toBeTruthy();
  const emptyWorkspace = await emptyWorkspaceResponse.json() as { id: string };
  await page.reload();
  const workspaceSelect = page.locator('header select').first();
  await workspaceSelect.selectOption(emptyWorkspace.id);
  await expect(page.getByRole('heading', { name: 'Select a board' })).toBeVisible();
  await page.waitForTimeout(6_000);
  await expect(workspaceSelect).toHaveValue(emptyWorkspace.id);
  await expect(page.getByRole('heading', { name: 'Select a board' })).toBeVisible();
  await expect(page.locator('header').getByText('Platform Sprint 24')).toHaveCount(0);
  await workspaceSelect.selectOption('w1');

  // --- Automation management selects Workspace and Board in one panel ---
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Automations' }).click();
  await expect(page.getByLabel('Automation workspace')).toBeVisible();
  await expect(page.getByLabel('Automation board')).toBeVisible();
  await page.getByLabel('Automation workspace').selectOption('w2');
  await expect(page.getByLabel('Automation board')).toHaveValue('b3');
  await page.getByText('Management').locator('..').getByRole('button').click();

  // --- Board selection via header dropdown ---
  // After login, a board should be selected in the header combobox
  const boardSelect = page.getByRole('combobox').nth(1);
  await expect(boardSelect).toBeVisible({ timeout: 10000 });

  // Select "Platform Sprint 24" from the board dropdown
  await boardSelect.selectOption({ label: 'Platform Sprint 24' });
  await expect(boardSelect.locator('option:checked')).toHaveText('Platform Sprint 24');

  // --- Card interaction: open card, move lists, toggle watch, add attachment, add comment ---
  await page.getByText('Implement OAuth2 login flow').click();
  await expect(page.getByLabel('Card list')).toBeVisible();
  await page.getByLabel('Card list').selectOption({ label: 'Backlog' });
  await expect(page.getByText('In list Backlog')).toBeVisible();

  await expect(page.getByLabel('Stop watching card')).toBeVisible();
  await page.getByLabel('Stop watching card').click();
  await expect(page.getByLabel('Watch card')).toBeVisible();

  await page.getByRole('button', { name: /attachment/i }).click();
  await page.getByPlaceholder('Paste link or cloud doc URL').fill('docs.example.com/auth');
  await page.getByRole('button', { name: 'Attach' }).click();
  await expect(page.getByRole('link', { name: 'docs.example.com/auth' })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Attachment preview text '.repeat(12_000), 'utf8'),
  });
  await expect(page.getByLabel('Download notes.txt')).toBeVisible();
  await page.waitForTimeout(5500);
  await expect(page.getByLabel('Download notes.txt')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByLabel('Download notes.txt').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('notes.txt');

  await expect(page.getByLabel('View notes.txt')).toHaveAttribute('target', '_blank');
  await expect(page.getByLabel('View notes.txt')).toHaveAttribute('href', /data:text\/plain/i);

  await page.getByPlaceholder('Write a comment...').fill('Please review this @Alex Chen');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByLabel('Close card').click();

  // --- Search ---
  await page.getByLabel('Open search').click();
  await page.getByPlaceholder('Search cards… (try @name, #label, is:overdue)').fill('@alex');
  await expect(page.getByText('Set up CI/CD pipeline for monorepo').first()).toBeVisible();
  // Close search
  await page.keyboard.press('Escape');

  // --- Create new board via navigation overlay ---
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Boards' }).click();
  await page.getByText('+ Add board').click();
  const boardInput = page.getByPlaceholder('Board name…');
  await expect(boardInput).toBeVisible({ timeout: 5000 });
  await boardInput.fill('E2E Test Board');
  await boardInput.press('Enter');

  // Close management overlay, then navigate from the header dropdown
  await page.getByRole('button', { name: '✕' }).click();
  await boardSelect.selectOption({ label: 'E2E Test Board' });
  await expect(boardSelect.locator('option:checked')).toHaveText('E2E Test Board', { timeout: 5000 });

  // --- Create a list on the new board ---
  const addListButton = page.getByRole('button', { name: '+ Add another list' });
  if (await addListButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addListButton.click();
  }
  const addListInput = page.getByPlaceholder('List title…');
  if (await addListInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addListInput.fill('E2E List');
    await addListInput.press('Enter');
    await expect(page.getByText('E2E List')).toBeVisible();
  }

  // --- Account settings overlay flows ---
  await page.getByRole('button', { name: 'Open profile menu' }).click();

  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByLabel('Display name').fill('System Admin Prime');
  await page.getByLabel('Initials').fill('SP');
  await page.getByRole('button', { name: 'Save Profile' }).click();
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toHaveText('SP');

  await page.getByRole('button', { name: 'Back to account menu' }).click();
  await page.getByRole('button', { name: /^Preferences/ }).click();
  await page.getByRole('radio', { name: /Light mode/ }).check();
  await page.getByRole('button', { name: 'Save Preferences' }).click();
  await expect.poll(async () => page.locator('html').evaluate(node => node.getAttribute('data-theme'))).toBe('light');

  await page.getByRole('button', { name: 'Back to account menu' }).click();
  await page.getByRole('button', { name: /^Security/ }).click();
  await page.getByRole('button', { name: 'Generate Recovery Key' }).click();
  await expect(page.getByText('Keep this key safe. Anyone with this key can use it to recover your account.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy to clipboard' })).toBeVisible();
  await page.getByRole('button', { name: 'Close recovery key' }).click();
  await page.getByLabel('Current password').fill('ChangeThisNow123!');
  await page.getByLabel('New password', { exact: true }).fill('PasswordChange123!');
  await page.getByLabel('Confirm new password').fill('PasswordChange123?');
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByText('New passwords do not match.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // --- Logout via profile overlay ---
  await page.getByRole('button', { name: /^Sign Out/ }).click();
  await expect(page.getByLabel('Username')).toBeVisible({ timeout: 5000 });

  // --- Login again and verify persistence ---
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('ChangeThisNow123!');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Seeded boards should still be present in the board dropdown
  const boardSelectAfterLogin = page.getByRole('combobox').nth(1);
  await expect(boardSelectAfterLogin).toBeVisible({ timeout: 10000 });
  await expect.poll(async () => page.locator('html').evaluate(node => node.getAttribute('data-theme'))).toBe('light');
  // The E2E-created board should persist as an option
  await expect(boardSelectAfterLogin.locator('option', { hasText: 'E2E Test Board' })).toBeAttached();
});
