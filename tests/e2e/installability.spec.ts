/// <reference lib="dom" />

import { expect, test } from '@playwright/test';

test('the browser reads the Strata manifest and decodes installation icons', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Strata');
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');

  const client = await page.context().newCDPSession(page);
  const manifest = await client.send('Page.getAppManifest');
  expect(manifest.url).toContain('/manifest.webmanifest');
  expect(manifest.errors).toEqual([]);
  expect(JSON.parse(manifest.data ?? '{}')).toMatchObject({
    name: 'Strata', id: '/', start_url: '/', scope: '/', display: 'standalone',
  });
  await client.detach();

  const response = await page.request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('application/manifest+json');

  for (const [src, size] of [
    ['/icons/strata-192.png', 192],
    ['/icons/strata-512.png', 512],
    ['/icons/apple-touch-icon.png', 180],
  ] as const) {
    const iconResponse = await page.request.get(src);
    expect(iconResponse.ok()).toBe(true);
    expect(iconResponse.headers()['content-type']).toContain('image/png');
    const dimensions = await page.evaluate(async iconUrl => {
      const image = new Image();
      image.src = iconUrl;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, src);
    expect(dimensions).toEqual({ width: size, height: size });
  }

  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png');
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  await page.reload();
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
});
