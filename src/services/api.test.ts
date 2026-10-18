import { apiRequest } from './api';

describe('apiRequest error envelopes', () => {
  it('keeps JSON content type when a mutation supplies an idempotency header', async () => {
    const fetch = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit) => { void _path; void _init; return Response.json({ ok: true }); });
    vi.stubGlobal('fetch', fetch);
    await apiRequest('/api/content-operations', { method: 'POST', headers: { 'Idempotency-Key': 'operation' }, body: '{}' });
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Content-Type')).toBe('application/json');
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Idempotency-Key')).toBe('operation');
  });
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
