import { config } from './config';

export class ApiError extends Error {
  constructor(message, status, requestId) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
  }
}

export function getApiBaseUrl() {
  if (!config.apiBaseUrl) return '';
  try {
    const url = new URL(config.apiBaseUrl);
    if (typeof window !== 'undefined' && window.location) {
      if (['localhost', '127.0.0.1'].includes(url.hostname)) {
        return `${url.protocol}//${window.location.hostname}:${url.port || '8000'}`;
      }
    }
  } catch {
    /* Fall back to config.apiBaseUrl directly */
  }
  return config.apiBaseUrl;
}

export async function apiRequest(path, { token, signal, ...options } = {}) {
  const timeout = AbortSignal.timeout(10000);
  let response;
  const baseUrl = getApiBaseUrl();
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      credentials: options.credentials || 'include',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: {
        Accept: 'application/json',
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError('We could not reach your workspace. Please try again.', 0);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      body?.error?.message || 'Your request could not be completed.',
      response.status,
      response.headers.get('X-Request-ID'),
    );
  }
  return body;
}
