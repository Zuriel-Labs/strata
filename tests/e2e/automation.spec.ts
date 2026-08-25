import { expect, test, type Page } from '@playwright/test';

async function waitForServer(page: Page) {
  await expect.poll(async () => {
    try {
      const response = await page.request.get('http://127.0.0.1:8788/api/health');
      return response.ok();
    } catch {
      return false;
    }
  }, { timeout: 30000 }).toBeTruthy();
}

async function signInAsWorkspaceAdmin(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username').fill('alex');
  await page.getByLabel('Password').fill('WorkspaceAdmin123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible({ timeout: 10000 });
}

async function addBoardList(page: Page, title: string) {
  await page.getByRole('button', { name: '+ Add another list' }).click();
  await page.getByPlaceholder('List title…').fill(title);
  await page.getByPlaceholder('List title…').press('Enter');
  await expect(page.getByText(title)).toBeVisible();
}

async function openAutomationCreator(page: Page) {
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Automations' }).click();
  await page.getByRole('button', { name: '+ Create automation rule' }).click();
  const nameInput = page.getByPlaceholder('Rule name…');
  await expect(nameInput).toBeVisible();
  return nameInput.locator('xpath=ancestor::div[contains(@class,"space-y-2")][1]');
}

test('automation rules can be created and executed in the browser', async ({ page }) => {
  await waitForServer(page);
  await signInAsWorkspaceAdmin(page);

  const boardSelect = page.getByRole('combobox').first();
  await boardSelect.selectOption({ label: 'Platform Sprint 24' });
  const membership = await page.request.put('/api/admin/boards/b1/members/u2', { data: { role: 'member' } });
  expect(membership.ok()).toBeTruthy();
  await page.reload();
  await boardSelect.selectOption({ label: 'Platform Sprint 24' });

  await addBoardList(page, 'Automation Intake');
  await addBoardList(page, 'Automation Review');
  await addBoardList(page, 'Automation Done');

  let form = await openAutomationCreator(page);
  await form.getByPlaceholder('Rule name…').fill('Assign Alex in automation review');
  await form.locator('select').nth(1).selectOption({ label: 'Automation Review' });
  await form.locator('select').nth(5).selectOption({ label: 'Alex Chen' });
  await form.getByRole('button', { name: 'Create Rule' }).click();
  await expect(page.getByText('Assign Alex in automation review')).toBeVisible();

  await page.getByRole('button', { name: '+ Create automation rule' }).click();
  form = page.getByPlaceholder('Rule name…').locator('xpath=ancestor::div[contains(@class,"space-y-2")][1]');
  await form.getByPlaceholder('Rule name…').fill('Complete cards in automation done');
  await form.locator('select').nth(1).selectOption({ label: 'Automation Done' });
  await form.locator('select').nth(4).selectOption({ label: 'Mark due date complete' });
  await form.getByRole('button', { name: 'Create Rule' }).click();
  await expect(page.getByText('Complete cards in automation done')).toBeVisible();

  await page.getByRole('button', { name: '✕' }).first().click();

  await page.getByRole('button', { name: '+ Add a card' }).first().click();
  await page.getByPlaceholder('Card title…').fill('Automation browser verification');
  await page.getByPlaceholder('Card title…').press('Enter');

  await page.getByText('Automation browser verification').click();
  await page.getByRole('button', { name: /dates/i }).click();
  await page.locator('input[type="date"]').fill('2026-03-21');
  const dueComplete = page.locator('label:has-text("Complete") input[type="checkbox"]');
  await expect(dueComplete).not.toBeChecked();

  await page.getByLabel('Card list').selectOption({ label: 'Automation Review' });
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();

  await page.getByLabel('Card list').selectOption({ label: 'Automation Done' });
  await expect(dueComplete).toBeChecked();
});

test('card-created automations can label and route cards in the browser', async ({ page }) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const intakeList = `Automation Draft ${suffix}`;
  const triageList = `Automation Triage ${suffix}`;
  const cardTitle = `Automation created ${suffix}`;

  await waitForServer(page);
  await signInAsWorkspaceAdmin(page);

  const boardSelect = page.getByRole('combobox').first();
  await boardSelect.selectOption({ label: 'Platform Sprint 24' });

  await addBoardList(page, intakeList);
  await addBoardList(page, triageList);

  let form = await openAutomationCreator(page);
  await form.getByPlaceholder('Rule name…').fill(`Label created cards ${suffix}`);
  await form.locator('select').nth(0).selectOption({ label: 'When a card is created' });
  await form.locator('select').nth(1).selectOption({ label: intakeList });
  await form.locator('select').nth(3).selectOption({ label: 'Add a label' });
  await form.locator('select').nth(4).selectOption({ label: 'Urgent' });
  await form.getByRole('button', { name: 'Create Rule' }).click();
  await expect(page.getByText(`Label created cards ${suffix}`)).toBeVisible();

  await page.getByRole('button', { name: '+ Create automation rule' }).click();
  form = page.getByPlaceholder('Rule name…').locator('xpath=ancestor::div[contains(@class,"space-y-2")][1]');
  await form.getByPlaceholder('Rule name…').fill(`Route created cards ${suffix}`);
  await form.locator('select').nth(0).selectOption({ label: 'When a card is created' });
  await form.locator('select').nth(1).selectOption({ label: intakeList });
  await form.locator('select').nth(2).selectOption({ label: 'Urgent' });
  await form.locator('select').nth(3).selectOption({ label: 'Move to a list' });
  await form.locator('select').nth(4).selectOption({ label: triageList });
  await form.getByRole('button', { name: 'Create Rule' }).click();
  await expect(page.getByText(`Route created cards ${suffix}`)).toBeVisible();

  await page.getByRole('button', { name: '✕' }).first().click();

  const addCardButtons = page.getByRole('button', { name: '+ Add a card' });
  await addCardButtons.nth((await addCardButtons.count()) - 2).click();
  await page.getByPlaceholder('Card title…').fill(cardTitle);
  await page.getByPlaceholder('Card title…').press('Enter');

  await expect(page.getByText(cardTitle)).toBeVisible();
  await page.getByText(cardTitle).click();
  await expect(page.getByRole('button', { name: 'Urgent', exact: true })).toBeVisible();
  await expect(page.getByText(`In list ${triageList}`)).toBeVisible();
});

test('date-time automations update visible cards after the scheduled time', async ({ page }) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const schedule = new Date();
  const localDateTime = `${schedule.getFullYear()}-${String(schedule.getMonth() + 1).padStart(2, '0')}-${String(schedule.getDate()).padStart(2, '0')}T${String(schedule.getHours()).padStart(2, '0')}:${String(schedule.getMinutes()).padStart(2, '0')}`;

  await waitForServer(page);
  await signInAsWorkspaceAdmin(page);

  const boardSelect = page.getByRole('combobox').first();
  await boardSelect.selectOption({ label: 'Platform Sprint 24' });

  const form = await openAutomationCreator(page);
  await form.getByPlaceholder('Rule name…').fill(`Timed urgent label ${suffix}`);
  await form.locator('select').nth(0).selectOption({ label: 'At a specific date and time' });
  await form.locator('input[type="datetime-local"]').fill(localDateTime);
  await form.locator('select').nth(1).selectOption({ label: 'Backlog' });
  await form.locator('select').nth(3).selectOption({ label: 'Add a label' });
  await form.locator('select').nth(4).selectOption({ label: 'Urgent' });
  await form.getByRole('button', { name: 'Create Rule' }).click();
  await expect(page.getByText(`Timed urgent label ${suffix}`)).toBeVisible();

  await page.getByRole('button', { name: '✕' }).first().click();
  await page.getByText('Evaluate state management options').click();

  await expect.poll(async () => {
    const urgentCount = await page.getByRole('button', { name: 'Urgent', exact: true }).count();
    return urgentCount > 0;
  }, { timeout: 15000 }).toBe(true);
});
