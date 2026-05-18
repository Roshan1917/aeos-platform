/**
 * api wrapper — refresh-on-401 flow.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/lib/auth';

describe('api refresh flow', () => {
  beforeEach(() => {
    useAuthStore.getState().setTokens({ access: 'old-access', refresh: 'old-refresh' });
    vi.restoreAllMocks();
  });

  it('retries the request once after a successful refresh', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];

    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      calls.push({ url, init });

      if (url.endsWith('/api/substrate/v1/auth/refresh')) {
        return new Response(
          JSON.stringify({ access_token: 'new-access', refresh_token: 'new-refresh' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      const isRetry = (init?.headers as Record<string, string>)?.Authorization === 'Bearer new-access';
      if (isRetry) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('unauthorized', { status: 401 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await api<{ ok: boolean }>('substrate', '/v1/users');

    expect(result).toEqual({ ok: true });
    expect(calls.map((c) => c.url)).toEqual([
      '/api/substrate/v1/users',
      '/api/substrate/v1/auth/refresh',
      '/api/substrate/v1/users',
    ]);
    expect(useAuthStore.getState().accessToken).toBe('new-access');
    expect(useAuthStore.getState().refreshToken).toBe('new-refresh');
  });

  it('clears tokens when refresh fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/api/substrate/v1/auth/refresh')) {
        return new Response('nope', { status: 401 });
      }
      return new Response('unauthorized', { status: 401 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api('substrate', '/v1/users')).rejects.toMatchObject({ status: 401 });
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });
});
