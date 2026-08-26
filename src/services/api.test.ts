import { apiRequest } from './api';

describe('apiRequest error envelopes', () => {
  it('preserves safe machine-readable conflict code and details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      message: 'Board labels changed since this editor was opened.',
      code: 'LABEL_VERSION_CONFLICT',
      details: { boardId: 'b1', labelsRevision: 3, maxLabelsPerBoard: 12 },
    }, { status: 409 })));

    await expect(apiRequest('/api/boards/b1/labels')).rejects.toMatchObject({
      status: 409,
      code: 'LABEL_VERSION_CONFLICT',
      details: { boardId: 'b1', labelsRevision: 3, maxLabelsPerBoard: 12 },
    });
  });
});
