import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiFacade } from './apiFacade';
import { TypedEventBus } from '../core/events';
import { SessionManager } from '../session/sessionManager';
import { ClientKeyStore } from '../storage/clientKeyStore';
import type { TokensData } from '../types';

const now = Date.now();

const createHarness = (overrides?: Partial<TokensData> | null) => {
  let token: TokensData | null =
    overrides === null
      ? null
      : ({
          identifier: 'id-1',
          access_token: 'old-access',
          refresh_token: 'refresh-1',
          expires_at: now + 100_000,
          refresh_expires_at: now + 200_000,
          account_identifier: 'demo',
          ...(overrides ?? {})
        } satisfies TokensData);
  const adapter = {
    getTokenData: vi.fn(async () => token),
    setTokenData: vi.fn(async (data: TokensData) => { token = data; }),
    clearTokenData: vi.fn(async () => { token = null; })
  };
  const events = new TypedEventBus();
  const session = new SessionManager(adapter, events);
  const storage = new Map<string, string>();
  const clientKeyStore = new ClientKeyStore({
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => void storage.set(key, value),
    removeItem: (key) => void storage.delete(key)
  });
  return { adapter, events, session, clientKeyStore, getToken: () => token };
};

describe('ApiFacade', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refreshes once and retries failed auth call', async () => {
    const h = createHarness({
      // ensure we hit the protected call first, then refresh after the error
      expires_at: now + 100_000,
      refresh_expires_at: now + 200_000
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ERROR', reason: 'ACCESS_TOKEN_INVALID' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          identifier: 'id-1',
          account_identifier: 'demo',
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_at: now + 500_000,
          refresh_expires_at: now + 700_000
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'OK', pubkey: 'pubkey-123' })
      });
    vi.stubGlobal('fetch', fetchMock);

    const api = new ApiFacade({
      baseUrl: 'http://example.test',
      session: h.session,
      events: h.events,
      clientKeyStore: h.clientKeyStore
    });

    const result = await api.getPublicKey();
    expect(result).toBe('pubkey-123');
    expect(h.getToken()?.access_token).toBe('new-access');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('forces reauth on grant revoked from protected call', async () => {
    const h = createHarness();
    const reauthSpy = vi.fn();
    h.events.on('reauthRequired', reauthSpy);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ERROR', reason: 'GRANT_REVOKED' })
    });
    vi.stubGlobal('fetch', fetchMock);

    const api = new ApiFacade({
      baseUrl: 'http://example.test',
      session: h.session,
      events: h.events,
      clientKeyStore: h.clientKeyStore
    });

    await expect(api.getPublicKey()).rejects.toMatchObject({ code: 'GRANT_REVOKED' });
    expect(reauthSpy).toHaveBeenCalledWith({ reason: 'GRANT_REVOKED' });
    expect(h.getToken()).toBeNull();
  });

  it('single-flights concurrent refresh across calls', async () => {
    const h = createHarness({
      // expired so concurrent calls trigger refresh immediately
      expires_at: now - 1,
      refresh_expires_at: now + 60_000
    });

    // Call order can interleave. We respond by inspecting URL.
    const refreshResponse = {
      status: 'OK',
      identifier: 'id-1',
      account_identifier: 'demo',
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_at: now + 500_000,
      refresh_expires_at: now + 700_000
    };

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = new URL(url).pathname;

      if (method === 'POST' && path === '/api/guest/refresh') {
        return { ok: true, json: async () => refreshResponse } as any;
      }
      if (method === 'GET' && path === '/api/v2/user/pubkey') {
        return { ok: true, json: async () => ({ status: 'OK', pubkey: 'pubkey-123' }) } as any;
      }
      return { ok: true, json: async () => ({ status: 'ERROR', reason: 'UNKNOWN' }) } as any;
    });
    vi.stubGlobal('fetch', fetchMock);

    const api = new ApiFacade({
      baseUrl: 'http://example.test',
      session: h.session,
      events: h.events,
      clientKeyStore: h.clientKeyStore
    });

    const [a, b] = await Promise.all([api.getPublicKey(), api.getPublicKey()]);
    expect(a).toBe('pubkey-123');
    expect(b).toBe('pubkey-123');

    const refreshCalls = fetchMock.mock.calls.filter(([url, init]) => {
      const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
      return method === 'POST' && new URL(url as string).pathname === '/api/guest/refresh';
    });
    expect(refreshCalls.length).toBe(1);
  });

  it('refreshes once across tabs sharing token storage', async () => {
    let tail: Promise<unknown> = Promise.resolve();
    vi.stubGlobal('navigator', {
      locks: {
        request: (_name: string, fn: () => Promise<unknown>) => {
          const run = tail.then(fn);
          tail = run.catch(() => {});
          return run;
        }
      }
    });

    const h = createHarness({ expires_at: now - 1, refresh_expires_at: now + 60_000 });
    const usedRefreshTokens: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === '/api/guest/refresh') {
        usedRefreshTokens.push(JSON.parse(String(init?.body)).refresh_token);
        return {
          ok: true,
          json: async () => ({
            status: 'OK',
            identifier: 'id-1',
            account_identifier: 'demo',
            access_token: 'new-access',
            refresh_token: 'refresh-2',
            expires_at: now + 500_000,
            refresh_expires_at: now + 700_000
          })
        } as any;
      }
      return { ok: true, json: async () => ({ status: 'OK', pubkey: 'pubkey-123' }) } as any;
    });
    vi.stubGlobal('fetch', fetchMock);

    const makeTab = () => new ApiFacade({
      baseUrl: 'http://example.test',
      session: new SessionManager(h.adapter, new TypedEventBus()),
      events: h.events,
      clientKeyStore: h.clientKeyStore
    });

    await Promise.all([makeTab().getPublicKey(), makeTab().getPublicKey()]);

    expect(usedRefreshTokens).toEqual(['refresh-1']);
    expect(h.getToken()?.refresh_token).toBe('refresh-2');
  });
});
