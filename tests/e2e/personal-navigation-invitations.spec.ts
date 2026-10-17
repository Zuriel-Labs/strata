import { expect, test } from '@playwright/test';

for (const width of [320, 768, 1440]) {
  test(`Home navigation fits and returns keyboard focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    expect((await page.request.post('/api/auth/login', { data: { username: 'alex', password: 'WorkspaceAdmin123!' } })).status()).toBe(200);
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Open Home' });
    await trigger.click();
    const home = page.getByRole('dialog', { name: 'Home', exact: true });
    expect(await home.evaluate(element => element.ownerDocument.defaultView?.getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    await home.getByRole('button', { name: 'All boards', exact: true }).click();
    await expect(home.getByRole('button', { name: /^Open .+/ }).first()).toBeVisible();
    await expect(home.getByLabel('Workspace', { exact: true })).toBeVisible();
    const bounds = await home.boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
    expect(await home.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await home.getByRole('textbox', { name: 'Invitation code', exact: true }).fill(`bi_${'a'.repeat(64)}`);
    const accept = home.getByRole('button', { name: 'Accept invitation', exact: true });
    await accept.hover();
    const contrast = await accept.evaluate(async element => {
      await Promise.all(element.getAnimations().map((animation: { finished: Promise<unknown> }) => animation.finished));
      const style = element.ownerDocument.defaultView!.getComputedStyle(element);
      const luminance = (color: string) => {
        const values = color.match(/[\d.]+/g)!.slice(0, 3).map(value => Number(value) / 255)
          .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
        return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
      };
      const foreground = luminance(style.color), background = luminance(style.backgroundColor);
      return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await home.getByRole('textbox', { name: 'Invitation code', exact: true }).fill('');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    expect(await page.locator('html').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
}

test('scoped invitation acceptance rotates sessions, grants only its board and keeps personal stars private', async ({ page, request, browser, baseURL }) => {
  let admin = await request.post('/api/auth/login', { data: { username: 'admin', password: 'ChangeThisNow123!' } });
  if (admin.status() === 401) {
    admin = await request.post('/api/auth/login', { data: { username: 'admin', password: 'ChangeMe123!' } });
    expect(admin.status()).toBe(200);
    expect((await request.post('/api/auth/password/change', { data: { currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!', confirmPassword: 'ChangeThisNow123!' } })).status()).toBe(204);
  }
  expect(admin.status()).toBe(200);
  const suffix = Date.now();
  const username = `invitation-${suffix}`;
  const created = await request.post('/api/admin/users', { data: { username, name: 'Invitation recipient', initials: 'IR', color: '#315ddc', platformRole: 'user', active: true, boardMemberships: [], workspaceMemberships: [] } });
  expect(created.status()).toBe(201);
  const account = await created.json() as { user: { id: string }; inviteToken: string };
  const recipient = await browser.newContext({ baseURL });
  const oldSession = await browser.newContext({ baseURL });
  try {
    expect((await recipient.request.post('/api/auth/recovery-key/consume', { data: { username, recoveryKey: account.inviteToken, newPassword: 'InvitationTestPassword123!', confirmPassword: 'InvitationTestPassword123!' } })).status()).toBe(200);
    expect((await recipient.request.post('/api/auth/login', { data: { username, password: 'InvitationTestPassword123!' } })).status()).toBe(200);
    expect((await oldSession.request.post('/api/auth/login', { data: { username, password: 'InvitationTestPassword123!' } })).status()).toBe(200);
    const recipientPage = await recipient.newPage();
    await recipientPage.goto('/');
    await expect(recipientPage.getByRole('button', { name: 'Open admin panel' })).toHaveCount(0);
    await recipientPage.getByRole('button', { name: 'All boards', exact: true }).click();
    await expect(recipientPage.getByText('No workspaces available. Ask an administrator for board access.')).toBeVisible();

    expect((await page.request.post('/api/auth/login', { data: { username: 'alex', password: 'WorkspaceAdmin123!' } })).status()).toBe(200);
    const title = `Invitation board ${suffix}`;
    const boardResponse = await page.request.post('/api/boards', { data: { workspaceId: 'w1', title, color: '#6366f1' } });
    expect(boardResponse.status()).toBe(201);
    const board = await boardResponse.json() as { id: string; starred: boolean };
    await page.goto('/');
    const opener = page.getByRole('button', { name: 'Open admin panel' });
    await opener.click();
    const administration = page.getByRole('dialog', { name: 'Access & Membership' });
    await administration.getByRole('button', { name: 'Board Members', exact: true }).click();
    await administration.getByLabel('Search manageable Boards').fill(title);
    await expect(administration.getByLabel('Board', { exact: true }).locator(`option[value="${board.id}"]`)).toBeAttached();
    await administration.getByLabel('Board', { exact: true }).selectOption(board.id);
    await administration.getByLabel('Search invitation recipients').fill(username);
    await expect(administration.getByLabel('Invitation recipient', { exact: true }).locator(`option[value="${account.user.id}"]`)).toBeAttached();
    await administration.getByLabel('Invitation recipient', { exact: true }).selectOption(account.user.id);
    await administration.getByLabel('Invitation role').selectOption('observer');
    await administration.getByRole('button', { name: 'Create invitation', exact: true }).click();
    const codeField = administration.getByLabel('One-time board invitation code');
    await expect(codeField).toBeVisible();
    const code = await codeField.inputValue();
    const pending = await page.request.get(`/api/admin/boards/${board.id}/invitations`);
    expect(pending.status()).toBe(200);
    const pendingBody = await pending.json() as { items: Array<{ id: string }> };
    expect(JSON.stringify(pendingBody).includes('bi_')).toBe(false);
    await administration.getByRole('button', { name: 'Dismiss code' }).click();
    await expect(codeField).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();

    await recipientPage.getByLabel('Invitation code').fill(code);
    const acceptance = recipientPage.waitForResponse(response => response.url().endsWith('/api/auth/board-invitations/accept') && response.request().method() === 'POST');
    await recipientPage.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    expect((await acceptance).status()).toBe(200);
    await expect(recipientPage.getByRole('button', { name: 'Open Home' })).toBeVisible();
    expect((await oldSession.request.get('/api/auth/session')).status()).toBe(401);
    expect((await recipient.request.patch('/api/boards/b2', { data: { title: 'Forbidden sibling mutation' } })).status()).toBe(403);
    await recipientPage.getByRole('button', { name: 'Open Home' }).click();
    const home = recipientPage.getByRole('dialog', { name: 'Home', exact: true });
    await home.getByRole('button', { name: 'All boards', exact: true }).click();
    await expect(home.getByRole('button', { name: `Open ${title}`, exact: true })).toBeVisible();
    await home.getByRole('button', { name: `Add ${title} to your stars` }).click();
    await expect(home.getByRole('button', { name: `Remove ${title} from your stars` })).toBeVisible();
    const ownStars = await recipient.request.get('/api/auth/navigation?kind=starred');
    expect((await ownStars.json() as { items: Array<{ boardId: string }> }).items.map(item => item.boardId)).toContain(board.id);
    const issuerStars = await page.request.get('/api/auth/navigation?kind=starred');
    expect((await issuerStars.json() as { items: Array<{ boardId: string }> }).items.map(item => item.boardId)).not.toContain(board.id);
    const shared = await page.request.get('/api/auth/session');
    expect((await shared.json() as { appState: { boards: Array<{ id: string; starred: boolean }> } }).appState.boards.find(item => item.id === board.id)?.starred).toBe(board.starred);
    expect((await recipient.request.delete(`/api/admin/boards/${board.id}/invitations/${pendingBody.items[0].id}`)).status()).toBe(403);
    expect((await page.request.delete(`/api/admin/boards/${board.id}/invitations/${pendingBody.items[0].id}`)).status()).toBe(204);
    expect((await recipient.request.post('/api/auth/board-invitations/accept', { data: { token: code } })).status()).toBe(404);
    const stillAuthorized = await recipient.request.put(`/api/auth/navigation/boards/${board.id}/visit`, { data: {} });
    expect(stillAuthorized.status()).toBe(204);
    expect((await page.request.delete(`/api/admin/boards/${board.id}/members/${account.user.id}`)).status()).toBe(200);
    await recipientPage.keyboard.press('Escape');
    await recipientPage.reload();
    await expect(recipientPage.getByText(title, { exact: true })).toHaveCount(0);
    expect((await recipient.request.get('/api/auth/navigation?kind=starred')).status()).toBe(401);
    expect((await recipient.request.post('/api/auth/login', { data: { username, password: 'InvitationTestPassword123!' } })).status()).toBe(200);
    const filteredStars = await recipient.request.get('/api/auth/navigation?kind=starred');
    expect((await filteredStars.json() as { items: unknown[] }).items).toEqual([]);
    expect((await recipient.request.put(`/api/auth/navigation/boards/${board.id}/visit`, { data: {} })).status()).toBe(404);
  } finally { await recipient.close(); await oldSession.close(); }
});
