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

let inFlightRefresh = null;

async function refreshSessionSingleFlight(baseUrl) {
  if (inFlightRefresh) return inFlightRefresh;
  inFlightRefresh = (async () => {
    try {
      const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}

export async function apiRequest(path, { token, signal, _retried = false, ...options } = {}) {
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

  // Silently refresh short-lived access cookie on 401 and retry once
  const isAuthEndpoint = path.startsWith('/api/v1/auth/');
  if (response.status === 401 && !_retried && !isAuthEndpoint && !token && config.apiBaseUrl) {
    const refreshed = await refreshSessionSingleFlight(baseUrl);
    if (refreshed) {
      return apiRequest(path, { ...options, token, signal, _retried: true });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('snr:session-expired'));
    }
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      body?.error?.message || body?.detail || 'Your request could not be completed.',
      response.status,
      response.headers.get('X-Request-ID'),
    );
  }
  return body;
}
