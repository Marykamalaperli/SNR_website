export class ApiError extends Error {
  status: number;
  requestId: string | null;
  constructor(message: string, status: number, requestId?: string | null);
}

export function getApiBaseUrl(): string;

export function apiRequest<T = any>(
  path: string,
  options?: RequestInit & { token?: string; _retried?: boolean },
): Promise<T>;

