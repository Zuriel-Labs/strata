import { afterEach, describe, expect, it, vi } from 'vitest';
import { updatePreferences } from './session';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('preference request serialization', () => {
  it('sends explicit null defaults so they can be cleared', async () => {
    const fetch = vi.fn(async () => Response.json({ user: {} }));
    vi.stubGlobal('fetch', fetch);

    await updatePreferences('dark', null, null);

    expect(fetch).toHaveBeenCalledWith('/api/auth/preferences', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ themePreference: 'dark', defaultWorkspaceId: null, defaultBoardId: null }),
    }));
  });

  it('omits defaults when only the theme is provided', async () => {
    const fetch = vi.fn(async () => Response.json({ user: {} }));
    vi.stubGlobal('fetch', fetch);

    await updatePreferences('light');

    expect(fetch).toHaveBeenCalledWith('/api/auth/preferences', expect.objectContaining({
      body: JSON.stringify({ themePreference: 'light' }),
    }));
  });
});
