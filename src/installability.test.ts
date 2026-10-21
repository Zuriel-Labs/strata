import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('browser installation metadata', () => {
  it('links a standalone Strata manifest with real install icons', () => {
    const html = new DOMParser().parseFromString(readFileSync('index.html', 'utf8'), 'text/html');
    const manifestHref = html.querySelector('link[rel="manifest"]')?.getAttribute('href');
    expect(manifestHref).toBe('/manifest.webmanifest');

    const manifest = z.object({
      id: z.literal('/'),
      name: z.literal('Strata'),
      short_name: z.literal('Strata'),
      start_url: z.literal('/'),
      scope: z.literal('/'),
      display: z.literal('standalone'),
      theme_color: z.string().regex(/^#[0-9a-f]{6}$/i),
      background_color: z.string().regex(/^#[0-9a-f]{6}$/i),
      icons: z.array(z.object({
        src: z.string().startsWith('/icons/'),
        sizes: z.string(),
        type: z.literal('image/png'),
        purpose: z.string(),
      })),
    }).parse(JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')));

    expect(manifest.icons.map(icon => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const icon of manifest.icons) {
      const png = readFileSync(resolve('public', `.${icon.src}`));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
    }
    expect(manifest.icons.some(icon => icon.purpose.split(' ').includes('maskable'))).toBe(true);
    expect(html.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(manifest.theme_color);
  });
});
