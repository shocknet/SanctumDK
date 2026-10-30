// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSanctumDK } from '../core/client';
import { AUTH_SOCKET_CANCELLED_MESSAGE, AuthSocketClient } from './authSocketClient';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  sent: string[] = [];
  private listeners: Record<string, Array<(ev: any) => void>> = {};

  static holdOpen = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      if (MockWebSocket.holdOpen) return;
      this.markOpen();
    });
  }

  markOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
    this.emit('open', {});
  }

  send(data: string) {
    this.sent.push(String(data));
  }

  addEventListener(type: string, handler: (ev: any) => void) {
    (this.listeners[type] ??= []).push(handler);
  }

  private emit(type: string, event: any) {
    for (const handler of this.listeners[type] ?? []) {
      handler(event);
    }
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({});
    this.emit('close', {});
  }

  emitMessage(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
    this.emit('message', { data: JSON.stringify(obj) });
  }
}

describe('Integration flows', () => {
  it('mount sets host attributes and destroy makes mount unusable', async () => {
    // widgetController uses matchMedia; jsdom doesn't always provide it.
    (window as any).matchMedia ??= () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });

    const div = document.createElement('div');
    div.id = 'sanctum-widget';
    document.body.appendChild(div);

    const client = createSanctumDK({ url: 'https://auth.example.com' });
    client.widget.mount({ containerId: 'sanctum-widget', theme: 'dark' });

    // mount triggers an async bootstrap render (reads storage/client key).
    await new Promise((r) => setTimeout(r, 0));

    expect(div.getAttribute('data-product')).toBe('sanctum');
    expect(div.getAttribute('data-theme')).toBe('dark');

    await client.destroy();
    expect(() => client.widget.mount({ containerId: 'sanctum-widget' })).toThrow();
  });

  it('remounting on the same element rebuilds the widget instead of throwing', async () => {
    (window as any).matchMedia ??= () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });

    const div = document.createElement('div');
    div.id = 'sanctum-widget-remount';
    document.body.appendChild(div);

    const first = createSanctumDK({ url: 'https://auth.example.com' });
    first.widget.mount({ containerId: 'sanctum-widget-remount', theme: 'dark' });
    await first.destroy();

    const second = createSanctumDK({ url: 'https://auth.example.com' });
    expect(() => second.widget.mount({ containerId: 'sanctum-widget-remount', theme: 'light' })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));

    expect(div.getAttribute('data-theme')).toBe('light');
    await second.destroy();
  });

  it('AuthSocketClient start() resolves after receiving TokensData', async () => {
    // Provide WebSocket implementation for the socket client.
    (globalThis as any).WebSocket = MockWebSocket as any;

    const client = new AuthSocketClient({
      url: 'wss://auth.example.com',
      getClientKey: async () => 'client-key-1',
    });

    const startPromise = client.start();
    // flush
    await new Promise((r) => setTimeout(r, 0));
    
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    expect(ws).toBeTruthy();

    // Server can send request token first
    ws!.emitMessage({
      status: 'OK',
      payload: {
        type: 'request_token',
        request_token: { request_token: 'req-1', expires_at: Date.now() + 30_000 }
      }
    });

    // Then tokens complete the flow
    ws!.emitMessage({
      status: 'OK',
      payload: {
        type: 'tokens',
        tokens: {
          access_token: 'a',
          refresh_token: 'r',
          expires_at: Date.now() + 60_000,
          refresh_expires_at: Date.now() + 3_600_000,
          identifier: 'npub123',
          account_identifier: 'demo@example.com'
        }
      }
    });

    const tokens = await startPromise;
    expect(tokens.access_token).toBe('a');
  });

  it('sends return_to on the socket hello when returnTo is set', async () => {
    (globalThis as any).WebSocket = MockWebSocket as any;
    MockWebSocket.instances = [];

    const client = new AuthSocketClient({
      url: 'wss://auth.example.com',
      getClientKey: async () => 'client-key-1',
      returnTo: 'https://wallet.example/auth-done',
    });

    const startPromise = client.start();
    await new Promise((r) => setTimeout(r, 0));

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    const hello = JSON.parse(ws!.sent[0]).body;
    expect(hello.return_to).toBe('https://wallet.example/auth-done');
    expect(hello.client_key).toBe('client-key-1');
    expect(hello.protocol_version).toBe(1);
    client.abort();
    await expect(startPromise).rejects.toThrow('cancelled by user');
  });

  it('omits return_to on the socket hello when returnTo is not set', async () => {
    (globalThis as any).WebSocket = MockWebSocket as any;
    MockWebSocket.instances = [];

    const client = new AuthSocketClient({
      url: 'wss://auth.example.com',
      getClientKey: async () => 'client-key-1',
    });

    const startPromise = client.start();
    await new Promise((r) => setTimeout(r, 0));

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    const hello = JSON.parse(ws!.sent[0]).body;
    expect(hello.return_to).toBeUndefined();
    client.abort();
    await expect(startPromise).rejects.toThrow('cancelled by user');
  });
});

describe('Auth socket reconnect', () => {
  let client: AuthSocketClient | null = null;

  afterEach(() => {
    client?.abort();
    client = null;
    vi.useRealTimers();
    MockWebSocket.holdOpen = false;
    MockWebSocket.instances = [];
    setVisibility('visible');
  });

  function startClient(): AuthSocketClient {
    (globalThis as any).WebSocket = MockWebSocket as any;
    vi.useFakeTimers();
    client = new AuthSocketClient({
      url: 'wss://auth.example.com',
      getClientKey: async () => 'client-key-1',
    });
    void client.start().catch((err: unknown) => {
      if (err instanceof Error && err.message === AUTH_SOCKET_CANCELLED_MESSAGE) return;
      throw err;
    });
    return client;
  }

  async function openedSocket(): Promise<MockWebSocket> {
    await vi.advanceTimersByTimeAsync(0);
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    expect(ws).toBeTruthy();
    return ws!;
  }

  function helloBody(ws: MockWebSocket): { request_token?: string } {
    expect(ws.sent.length).toBeGreaterThan(0);
    return JSON.parse(ws.sent[0]!).body;
  }

  it('retries a visible drop in 250ms', async () => {
    startClient();
    const first = await openedSocket();
    const before = MockWebSocket.instances.length;

    first.close();
    await vi.advanceTimersByTimeAsync(249);
    expect(MockWebSocket.instances.length).toBe(before);

    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances.length).toBe(before + 1);
  });

  it('reconnects immediately when the page returns, and sends the request token', async () => {
    startClient();
    const first = await openedSocket();
    first.emitMessage({
      status: 'OK',
      payload: {
        type: 'request_token',
        request_token: { request_token: 'req-1', expires_at: Date.now() + 30_000 }
      }
    });

    document.dispatchEvent(new Event('pause'));
    first.close();
    const before = MockWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(MockWebSocket.instances.length).toBe(before);

    document.dispatchEvent(new Event('resume'));
    await vi.advanceTimersByTimeAsync(0);
    expect(MockWebSocket.instances.length).toBe(before + 1);
    const next = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
    expect(helloBody(next).request_token).toBe('req-1');
  });

  it('leaves a live socket alone when the page returns', async () => {
    startClient();
    await openedSocket();
    const before = MockWebSocket.instances.length;

    document.dispatchEvent(new Event('pause'));
    document.dispatchEvent(new Event('resume'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(MockWebSocket.instances.length).toBe(before);
  });

  it('does not sit out a hung dial after the page returns', async () => {
    MockWebSocket.holdOpen = true;
    startClient();
    await openedSocket();
    const before = MockWebSocket.instances.length;

    document.dispatchEvent(new Event('pause'));
    await vi.advanceTimersByTimeAsync(9_000);
    expect(MockWebSocket.instances.length).toBe(before);

    document.dispatchEvent(new Event('resume'));
    await vi.advanceTimersByTimeAsync(0);
    expect(MockWebSocket.instances.length).toBe(before + 1);
  });

  it('connects when the page returns if auth started while hidden', async () => {
    setVisibility('hidden');
    startClient();
    const before = MockWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(MockWebSocket.instances.length).toBe(before);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(MockWebSocket.instances.length).toBe(before + 1);
  });

  it('keeps retrying after blur while the page stays visible', async () => {
    startClient();
    const first = await openedSocket();
    const before = MockWebSocket.instances.length;

    window.dispatchEvent(new Event('blur'));
    first.close();
    await vi.advanceTimersByTimeAsync(249);
    expect(MockWebSocket.instances.length).toBe(before);

    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances.length).toBe(before + 1);
  });

  it('focus connects a parked auth once the page is visible', async () => {
    setVisibility('hidden');
    startClient();
    const before = MockWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(0);
    expect(MockWebSocket.instances.length).toBe(before);

    setVisibility('visible');
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(MockWebSocket.instances.length).toBe(before + 1);
  });

  it('focus skips the rest of a pending retry', async () => {
    startClient();
    const first = await openedSocket();
    const before = MockWebSocket.instances.length;

    first.close();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(MockWebSocket.instances.length).toBe(before + 1);
  });
});

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

