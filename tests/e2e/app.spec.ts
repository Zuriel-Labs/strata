import { expect, test } from '@playwright/test';

test('mvp flow works end to end', async ({ page }) => {
  await expect.poll(async () => {
    try {
      const response = await page.request.get('http://127.0.0.1:8787/api/health');
      return response.ok();
    } catch {
      return false;
    }
  }).toBeTruthy();

  await page.goto('/');

  await page.getByLabel('Email').fill('admin@strata.local');
  await page.getByLabel('Password').fill('ChangeMe123!');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const currentPasswordField = page.getByLabel('Current password');
  const boardHeading = page.getByRole('heading', { name: 'Bug Tracker' });

  if (!(await currentPasswordField.isVisible().catch(() => false)) && !(await boardHeading.isVisible().catch(() => false))) {
    await expect(page.getByText('Invalid credentials.')).toBeVisible();
    await page.getByLabel('Password').fill('ChangeThisNow123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
  }

  if (await currentPasswordField.isVisible().catch(() => false)) {
    await currentPasswordField.fill('ChangeMe123!');
    await page.getByLabel('New password').fill('ChangeThisNow123!');
    await page.getByRole('button', { name: 'Update password' }).click();
  }

  await page.getByRole('button', { name: 'Platform Sprint 24' }).last().click();
  await expect(page.getByRole('heading', { name: 'Platform Sprint 24' })).toBeVisible();
  await page.getByText('Implement OAuth2 login flow').click();
  await page.getByPlaceholder('Paste link or cloud doc URL').fill('docs.example.com/auth');
  await page.getByRole('button', { name: 'Attach' }).click();
  await expect(page.getByRole('link', { name: 'docs.example.com/auth' })).toBeVisible();

  await page.getByPlaceholder('Write a comment… (use @name to mention)').fill('Please review this @Alex Chen');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByLabel('Close card').click();

  await page.getByLabel('Open search').click();
  await page.getByPlaceholder('Search cards… (try @name, #label, is:overdue)').fill('@alex');
  await expect(page.getByText('Set up CI/CD pipeline for monorepo').first()).toBeVisible();
});
