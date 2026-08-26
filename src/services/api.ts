export class ApiError extends Error {
  status: number;
  code: string | null;
  details: Record<string, unknown> | null;

  constructor(status: number, message: string, code: string | null = null, details: Record<string, unknown> | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'message' in payload ? String(payload.message) : response.statusText;
    const code = typeof payload === 'object' && payload && 'code' in payload ? String(payload.code) : null;
    const details = typeof payload === 'object' && payload && 'details' in payload && typeof payload.details === 'object' && payload.details
      ? payload.details as Record<string, unknown>
      : null;
    throw new ApiError(response.status, message || 'Request failed.', code, details);
  }

  return payload as T;
}
