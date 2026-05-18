/**
 * Unified fetch wrapper. Three "services" — substrate, telemetry,
 * recommendations — share one underlying fetch via the Vite proxy paths
 * /api/substrate, /api/telemetry, /api/recommendations. The wrapper
 * injects the JWT bearer header, parses JSON, and on 401 attempts a
 * one-shot refresh-token flow before retrying. Concurrent 401s share a
 * single inflight refresh promise to avoid a thundering-herd refresh
 * when a tab regains focus.
 */
import { useAuthStore } from './auth';

export type ServiceName =
  | 'substrate'
  | 'telemetry'
  | 'recommendations'
  | 'test-generator'
  | 'discovery';

export interface ApiError extends Error {
  status: number;
  payload?: unknown;
}

function makeApiError(message: string, status: number, payload?: unknown): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  err.payload = payload;
  return err;
}

let refreshInflight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  if (refreshInflight) return refreshInflight;
  const refresh = useAuthStore.getState().refreshToken;
  if (!refresh) return false;

  refreshInflight = (async () => {
    try {
      const res = await fetch('/api/substrate/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) {
        useAuthStore.getState().clear();
        return false;
      }
      const data = (await res.json()) as { access_token: string; refresh_token: string };
      useAuthStore.getState().setTokens({
        access: data.access_token,
        refresh: data.refresh_token,
      });
      return true;
    } catch {
      useAuthStore.getState().clear();
      return false;
    } finally {
      refreshInflight = null;
    }
  })();

  return refreshInflight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  signal?: AbortSignal;
  /** Skip auth header injection (e.g. for /v1/auth/token). */
  noAuth?: boolean;
}

async function rawFetch(service: ServiceName, path: string, opts: RequestOptions): Promise<Response> {
  const url = buildUrl(service, path, opts.query);
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  if (!opts.noAuth) {
    const token = useAuthStore.getState().accessToken;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
}

function buildUrl(service: ServiceName, path: string, query?: RequestOptions['query']): string {
  const base = `/api/${service}${path}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function api<T>(
  service: ServiceName,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  let res = await rawFetch(service, path, opts);

  if (res.status === 401 && !opts.noAuth) {
    const refreshed = await refreshTokens();
    if (refreshed) res = await rawFetch(service, path, opts);
  }

  if (!res.ok) {
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      payload = await res.text().catch(() => undefined);
    }
    const message =
      (payload && typeof payload === 'object' && 'detail' in payload && typeof (payload as { detail: unknown }).detail === 'string'
        ? (payload as { detail: string }).detail
        : null) ??
      (payload && typeof payload === 'object' && 'error' in payload && typeof (payload as { error: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : null) ??
      `${res.status} ${res.statusText}`;
    throw makeApiError(message, res.status, payload);
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) return undefined as T;
  return (await res.json()) as T;
}
