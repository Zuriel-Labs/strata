import { expect, test } from '@playwright/test';

const methods = /^(get|post|put|patch|delete|head|options|trace)$/;
const contractPath = '/api/v1/openapi.json';
const docs = '/api/docs';
const operationLink = (method: string, path: string) => '#op-' + method + '-' + encodeURIComponent(path);
const fixture = (paths: Record<string, unknown>) => ({openapi:'3.1.0',info:{version:'1.0.0'},paths});

test('indexes the entire live contract and restores operation links', async ({ page, request }) => {
  const response = await request.get(contractPath);
  expect(response.ok()).toBeTruthy();
  const contract = await response.json();
  const expected = Object.entries(contract.paths as Record<string, Record<string, unknown>>)
    .flatMap(([path, item]) => Object.keys(item).filter(method => methods.test(method)).map(method => operationLink(method,path))).sort();
  const unexpected: string[] = [];
  await page.route(contractPath, async route => {
    const headers = await route.request().allHeaders();
    if (headers.authorization || headers.cookie) unexpected.push('credential header');
    await route.continue();
  });
  await page.context().addCookies([{name:'reference-sentinel',value:'synthetic',url:new URL(response.url()).origin}]);
  await page.goto(docs);
  const results = page.getByRole('status').first();
  await expect(results).toHaveText(expected.length + ' of ' + expected.length + ' operations');
  const index = page.getByRole('navigation', { name:'Operation groups' }).locator('a');
  const indexed = await index.evaluateAll(links => links.map(link => link.getAttribute('href')).sort());
  expect(indexed).toEqual(expected);
  expect(new Set(indexed).size).toBe(expected.length);
  expect(unexpected).toEqual([]);
  await expect(page.locator('#identity')).toContainText(response.headers()['x-strata-contract-sha256']);
  const search = page.getByRole('searchbox');
  await search.fill('get /api/v1/me account:read');
  await expect(results).toHaveText('1 of ' + expected.length + ' operations');
  await search.press('Tab');
  await expect(page.getByLabel('Method', { exact:true })).toBeFocused();
  await page.getByRole('link', { name:'GET Read own account without application content' }).click();
  const title = page.getByRole('heading', {name:'Read own account without application content'});
  await expect(title).toBeFocused();
  await expect(page.getByText('YOUR_API_KEY', {exact:false})).toBeVisible();
  await page.reload();
  await expect(title).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading',{name:'Strata API reference'})).toBeVisible();
  await page.goForward();
  await expect(title).toBeVisible();
  await search.fill('does-not-exist');
  await expect(results).toHaveText(/No operations match/);
  await page.getByRole('button',{name:'Clear filters'}).click();
  await expect(search).toBeFocused();
  await page.getByLabel('Method',{exact:true}).selectOption('DELETE');
  await page.getByLabel('Area',{exact:true}).selectOption('Cards and collaboration');
  await expect(page.locator('#groups a')).toHaveCount(expected.filter(key => key.startsWith('#op-delete-%2Fapi%2Fv1%2Fcards')).length);
});

test('new untagged operation is discoverable and renders nested schemas safely', async ({ page }) => {
  const text = '<script>reference sentinel</script> [example](javascript:referenceSentinel)';
  let extra = true;
  const node = {type:'object',properties:{title:{type:'string',writeOnly:true},child:{$ref:'#/components/schemas/Node'}},required:['title']};
  const post = {summary:'Synthetic new operation',description:text,security:[{browserSession:[]}],
    parameters:[{name:'format',in:'query',required:true,schema:{enum:['simple','full']}}],
    requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/Node'},example:{title:text}},'text/plain':{schema:{type:'string'}}}},
    responses:{'201':{description:'Created',headers:{Location:{schema:{type:'string'}}},content:{'application/json':{schema:{$ref:'#/components/schemas/Node'}}}},'409':{description:'Conflict'}},
  };
  await page.route(contractPath, route => route.fulfill({json:{...fixture({
    '/api/v1/new-item':{get:{summary:'Another method',responses:{'204':{description:'No content'}}},...(extra?{post}:{})},
    '/api/v1/new/item':{post:{summary:'Similar path',responses:{'204':{description:'No content'}}}},
  }),components:{schemas:{Node:node}}}}));
  await page.setViewportSize({width:390,height:844});
  await page.goto(docs);
  await page.getByRole('button',{name:'Show operation index'}).click();
  await page.getByRole('searchbox').fill('synthetic new');
  await expect(page.locator('#groups summary')).toHaveText('Other operations (1)');
  await page.getByRole('link',{name:'POST Synthetic new operation'}).click();
  const detail=page.getByRole('article',{name:'Operation details'});
  await expect(detail.getByText(text,{exact:true})).toBeVisible();
  await expect(detail.locator('script, [href^="javascript:"]')).toHaveCount(0);
  await expect(detail.getByText('Browser session only',{exact:true})).toBeVisible();
  await expect(detail.getByText('Required role: Not documented')).toBeVisible();
  await expect(detail.getByText('format · query · required')).toBeVisible();
  await expect(detail.getByText('text/plain',{exact:true})).toBeVisible();
  await expect(detail.getByText('201 · Created')).toBeVisible();
  await expect(detail.getByText('409 · Conflict')).toBeVisible();
  const request = detail.locator('section').filter({has:page.getByRole('heading',{name:'Request body'})});
  await request.getByText('Referenced schema · object',{exact:true}).click();
  await request.getByText('title · required · string',{exact:true}).click();
  await expect(request.getByText('Write only',{exact:true})).toBeVisible();
  await request.getByText('child · optional',{exact:true}).click();
  await expect(request.getByText('Recursive reference. See the OpenAPI JSON.')).toBeVisible();
  expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => ({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
  extra = false;
  await page.reload();
  await expect(page.getByRole('heading',{name:'Operation unavailable in this contract'})).toBeVisible();
  await expect(page.locator('#groups a')).toHaveCount(2);
});

test('shows accessible contract loading, denial, invalid, empty, and partial states', async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  let state = 'unavailable';
  await page.route(contractPath, async route => {
    if (state === 'unavailable') { await gate; await route.fulfill({ status:503 }); }
    else if (state === 'denied') await route.fulfill({ status:403 });
    else if (state === 'invalid') await route.fulfill({json:{paths:[]}});
    else if (state === 'empty') await route.fulfill({json:fixture({})});
    else await route.fulfill({json:{...fixture({'/partial':{get:{summary:'Partial',responses:{'200':{$ref:'https://example.invalid/never-fetch'}}}}}),webhooks:{event:{}}}});
  });
  await page.goto(docs,{waitUntil:'domcontentloaded'});
  const results = page.getByRole('status').first();
  await expect(results).toHaveText(/Loading this deployment/);
  release();
  await expect(results).toHaveText('OpenAPI contract unavailable.');
  const retry=page.getByRole('button',{name:'Retry loading contract'});
  for(const [next,message] of [['denied','denied access'],['invalid','Invalid or unsupported'],['empty','lists no supported operations'],['partial','1 of 1 operations']]) {
    state=next;
    await retry.click();
    await expect(results).toContainText(message);
  }
  await expect(page.getByText('Webhooks are outside the operation index.')).toBeVisible();
});
