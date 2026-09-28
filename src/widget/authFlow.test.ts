// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSanctumDK } from '../core/client';
import { AuthSocketClient } from './authSocketClient';

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

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.({});
      this.emit('open', {});
    });
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
});

