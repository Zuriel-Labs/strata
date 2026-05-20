export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let csrfToken: string | null = null;

/**
 * Fetch a CSRF token from the server. The server sets a strata_csrf cookie
 * and returns the token value as JSON. We store it for inclusion in
 * mutating request headers.
 *
 * If the fetch fails (e.g., in test environments where fetch is mocked
 * and the CSRF endpoint isn't included), we silently skip CSRF protection.
 * The server in test mode (STRATA_CSRF_DISABLED=true) will accept
 * requests without the header.
 */
export async function fetchCsrfToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/csrf-token', {
      credentials: 'include',
    });
    if (!response.ok) {
      csrfToken = null;
      return null;
    }
    const data = await response.json() as { csrfToken: string };
    csrfToken = data.csrfToken;
    return csrfToken;
  } catch {
    csrfToken = null;
    return null;
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const isMutating = init?.method === 'POST' || init?.method === 'PATCH' || init?.method === 'PUT' || init?.method === 'DELETE';

  // For mutating requests, ensure we have a CSRF token
  if (isMutating && !csrfToken) {
    await fetchCsrfToken();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> ?? {}),
  };

  // Include CSRF token header on mutating requests (only if we have one)
  if (isMutating && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const response = await fetch(path, {
    credentials: 'include',
    headers,
    ...init,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'message' in payload ? String(payload.message) : response.statusText;

    // If CSRF token expired/invalid, re-fetch and retry once
    if (response.status === 403 && isMutating && csrfToken && message.includes('CSRF')) {
      csrfToken = null;
      const newToken = await fetchCsrfToken();
      if (newToken) {
        headers['X-CSRF-Token'] = newToken;
        const retryResponse = await fetch(path, {
          credentials: 'include',
          headers,
          ...init,
        });

        if (retryResponse.status === 204) {
          return undefined as T;
        }

        const retryContentType = retryResponse.headers.get('content-type') ?? '';
        const retryPayload = retryContentType.includes('application/json') ? await retryResponse.json() : await retryResponse.text();

        if (!retryResponse.ok) {
          const retryMessage = typeof retryPayload === 'object' && retryPayload && 'message' in retryPayload ? String(retryPayload.message) : retryResponse.statusText;
          throw new ApiError(retryResponse.status, retryMessage || 'Request failed.');
        }

        return retryPayload as T;
      }
    }

    throw new ApiError(response.status, message || 'Request failed.');
  }

  return payload as T;
}