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

test('System Administrators create mixed access and membership assignments independently', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await authenticateSystemAdmin(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open admin panel' })).toBeVisible();

  const suffix = Date.now();
  const username = `mixed${suffix}`;
  await page.getByRole('button', { name: 'Open admin panel' }).click();
  await page.getByRole('button', { name: 'Create User' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Mixed Access E2E');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Initials').fill('MX');

  const workspaceAccess = page.getByRole('group', { name: 'Workspace Administrator access' });
  const boardAccess = page.getByRole('group', { name: 'Board Administrator access' });
  const memberBoards = page.getByRole('group', { name: 'Member on Boards' });
  const observerBoards = page.getByRole('group', { name: 'Observer on Boards' });
  await workspaceAccess.getByRole('textbox').fill('Acme');
  await workspaceAccess.getByText('Acme Engineering', { exact: true }).click();
  await boardAccess.getByRole('textbox').fill('Bug Tracker');
  await boardAccess.getByText('Acme Engineering / Bug Tracker', { exact: true }).click();
  await memberBoards.getByRole('textbox').fill('Sprint');
  await memberBoards.getByText('Acme Engineering / Platform Sprint 24', { exact: true }).click();
  await observerBoards.getByRole('textbox').fill('Campaign');
  await observerBoards.getByText('Marketing / Q1 Campaign Plan', { exact: true }).click();

  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByLabel('Search accounts')).toBeVisible();
  await page.getByLabel('Search accounts').fill(username);
  await page.getByRole('button', { name: new RegExp(`@${username}`) }).click();
  await expect(page.getByLabel('Selected Workspace Administrator access')).toContainText('Acme Engineering');
  await expect(page.getByLabel('Selected Board Administrator access')).toContainText('Bug Tracker');
  await expect(page.getByLabel('Selected Member on Boards')).toContainText('Platform Sprint 24');
  await expect(page.getByLabel('Selected Observer on Boards')).toContainText('Q1 Campaign Plan');

  const directory = await page.request.get(`/api/admin/users?query=${username}`);
  expect(directory.ok()).toBeTruthy();
  const body = await directory.json() as { users: Array<{ id: string }> };
  expect(body.users).toHaveLength(1);
  const detail = await page.request.get(`/api/admin/users/${body.users[0].id}`);
  expect(await detail.json()).toMatchObject({
    user: {
      workspaceAdminGrants: [{ workspaceId: 'w1' }],
      boardAdminGrants: [{ boardId: 'b2' }],
      boardMemberships: expect.arrayContaining([
        expect.objectContaining({ boardId: 'b1', role: 'member' }),
        expect.objectContaining({ boardId: 'b3', role: 'observer' }),
      ]),
      derivedWorkspaceIds: expect.arrayContaining(['w1', 'w2']),
    },
  });
});

test('scoped non-member administrators manage Board membership without account escalation',async({page,request})=>{
  await page.goto('/');
  await page.getByLabel('Username').fill('alex');
  await page.getByLabel('Password').fill('WorkspaceAdmin123!');
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page.getByRole('button',{name:'Open admin panel'})).toBeVisible();

  const title=`Layered access ${Date.now()}`;
  const boardResponse=await page.request.post('/api/boards',{data:{workspaceId:'w1',title,color:'#6366f1'}});
  expect(boardResponse.ok()).toBeTruthy();
  const board=await boardResponse.json() as {id:string};

  await page.getByRole('button',{name:'Open admin panel'}).click();
  await expect(page.getByRole('heading',{name:'Access & Membership'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Create User'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Audit Log'})).toHaveCount(0);
  await page.getByRole('button',{name:'Board Members'}).click();
  await page.getByLabel('Search manageable Boards').fill(title);
  await expect(page.getByLabel('Board',{exact:true}).locator(`option[value="${board.id}"]`)).toHaveText(`Acme Engineering / ${title}`);
  await page.getByLabel('Board',{exact:true}).selectOption(board.id);
  await page.getByLabel('Search eligible accounts').fill('marcus');
  const eligible=page.getByText('@marcus',{exact:true}).locator('..').locator('..');
  await expect(eligible).toBeVisible();
  await eligible.getByRole('button',{name:'Add'}).click();
  await expect(page.getByText('@marcus').first()).toBeVisible();

  const login=await request.post('/api/auth/login',{data:{username:'marcus',password:'BoardAdmin123!'}});
  expect(login.ok()).toBeTruthy();
  const denied=await request.put(`/api/admin/boards/${board.id}/members/u3`,{data:{role:'member'}});
  expect(denied.status()).toBe(403);

  const membershipRow=page.getByText('@marcus',{exact:true}).first().locator('..').locator('..');
  await membershipRow.getByRole('button',{name:/Remove Marcus/}).click();
  await expect(page.getByRole('button',{name:/Remove Marcus/})).toHaveCount(0);
  await expect(page.getByText('@marcus',{exact:true})).toBeVisible();
});
