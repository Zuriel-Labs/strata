import { expect, test, type Locator, type Page } from '@playwright/test';

async function authenticateSystemAdmin(page: Page) {
  let login = await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: 'ChangeThisNow123!' },
  });
  if (login.status() === 401) {
    login = await page.request.post('/api/auth/login', {
      data: { username: 'admin', password: 'ChangeMe123!' },
    });
    expect(login.ok()).toBeTruthy();
    const changed = await page.request.post('/api/auth/password/change', {
      data: {
        currentPassword: 'ChangeMe123!',
        nextPassword: 'ChangeThisNow123!',
        confirmPassword: 'ChangeThisNow123!',
      },
    });
    expect(changed.ok()).toBeTruthy();
  }
  expect(login.ok()).toBeTruthy();
}

async function createScrollableAuditHistory(page: Page) {
  for (let index = 0; index < 30; index += 1) {
    const response = await page.request.post('/api/auth/login', {
      data: { username: 'admin', password: 'ChangeThisNow123!' },
    });
    expect(response.ok()).toBeTruthy();
  }
}

async function box(locator: Locator) {
  const result = await locator.boundingBox();
  expect(result).not.toBeNull();
  return result!;
}

type ChromeGeometry = { headerHeight: number; tabHeight: number };

async function chromeGeometry(dialog: Locator): Promise<ChromeGeometry> {
  return {
    headerHeight: (await box(dialog.locator('header'))).height,
    tabHeight: (await box(dialog.locator('nav'))).height,
  };
}

async function expectAuditBelowStableTabs(dialog: Locator, expected: ChromeGeometry, shouldScroll: boolean) {
  const header = dialog.locator('header');
  const tabs = dialog.locator('nav');
  const content = dialog.locator('main');
  const dialogBox = await box(dialog);
  const headerBox = await box(header);
  const tabsBox = await box(tabs);
  const contentBox = await box(content);

  expect(headerBox.height).toBeCloseTo(expected.headerHeight, 0);
  expect(tabsBox.height).toBeCloseTo(expected.tabHeight, 0);
  expect(tabsBox.y + tabsBox.height).toBeLessThanOrEqual(contentBox.y + 1);
  expect(contentBox.y + contentBox.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height + 1);
  await expect.poll(() => content.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(shouldScroll);

  for (const ratio of [0, 0.5, 1]) {
    await content.evaluate((element, nextRatio) => {
      element.scrollTop = (element.scrollHeight - element.clientHeight) * nextRatio;
    }, ratio);
    const scrolledHeaderBox = await box(header);
    const scrolledTabsBox = await box(tabs);
    const scrolledContentBox = await box(content);
    expect(scrolledHeaderBox).toEqual(headerBox);
    expect(scrolledTabsBox).toEqual(tabsBox);
    expect(scrolledTabsBox.y + scrolledTabsBox.height).toBeLessThanOrEqual(scrolledContentBox.y + 1);
  }
}

test('keeps scrollable Audit Log content below stable Administration tabs', async ({ page }) => {
  await page.setViewportSize({ width: 1209, height: 674 });
  await authenticateSystemAdmin(page);
  await createScrollableAuditHistory(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open admin panel' }).click();

  const dialog = page.getByRole('dialog', { name: 'Access & Membership' });
  const tabs = dialog.locator('nav');
  const initialChrome = await chromeGeometry(dialog);
  await dialog.getByRole('button', { name: 'Audit Log' }).click();
  await expect(dialog.locator('main section > div')).toHaveCount(25);
  await expect(dialog.getByText('auth.login', { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText('auth.navigation_visit', { exact: true }).first()).toBeVisible();
  await expectAuditBelowStableTabs(dialog, initialChrome, true);

  for (const tabName of ['People', 'Create User', 'Board Members', 'Audit Log']) {
    await dialog.getByRole('button', { name: tabName }).click();
    await expect(dialog.getByRole('button', { name: tabName })).toBeVisible();
  }

  await page.setViewportSize({ width: 390, height: 640 });
  const narrowChrome = await chromeGeometry(dialog);
  await expect.poll(() => tabs.evaluate(element => element.scrollWidth > element.clientWidth)).toBeTruthy();
  await expectAuditBelowStableTabs(dialog, narrowChrome, true);
});

test('preserves Administration chrome with empty and single-entry Audit Logs', async ({ page }) => {
  await page.setViewportSize({ width: 1209, height: 674 });
  await authenticateSystemAdmin(page);

  for (const auditEventCount of [0, 1]) {
    await page.route('**/api/admin/users**', async route => {
      const response = await route.fetch();
      const directory = await response.json() as { auditEvents: unknown[] };
      await route.fulfill({
        response,
        json: { ...directory, auditEvents: directory.auditEvents.slice(0, auditEventCount) },
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open admin panel' }).click();
    const dialog = page.getByRole('dialog', { name: 'Access & Membership' });
    const initialChrome = await chromeGeometry(dialog);
    await dialog.getByRole('button', { name: 'Audit Log' }).click();
    if (auditEventCount === 0) {
      await expect(dialog.getByText('No audit events.')).toBeVisible();
    } else {
      await expect(dialog.locator('main section > div')).toHaveCount(1);
    }
    await expectAuditBelowStableTabs(dialog, initialChrome, false);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await page.unroute('**/api/admin/users**');
  }
});
