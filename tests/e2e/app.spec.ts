import { expect, test } from '@playwright/test';

test('mvp flow works end to end', async ({ page }) => {
  await page.goto('/');

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
