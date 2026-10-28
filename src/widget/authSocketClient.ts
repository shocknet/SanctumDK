import type { TokensData } from '../types';
import httpClient from '../proto/http_client';
import {
  AuthSocketResponse,
  AuthSocketResponse_payload_type,
  ResultError,
  type AuthSocketAuthRequestTokenResponse,
  type AuthSocketClientHello
} from '../proto/types';

export type AuthSocketState = 'connecting' | 'reconnecting' | 'connected';

export type AuthSocketOptions = {
  url: string;
  getClientKey: () => Promise<string>;
  /** Sent as `return_to` on hello, including after reconnect. */
  returnTo?: string;
  onState?: (state: AuthSocketState) => void;
  onRequestToken?: (message: AuthSocketAuthRequestTokenResponse) => void;
  onError?: (message: string) => void;
  connectTimeoutMs?: number;
  maxReconnectAttempts?: number;
  reconnectBackoff?: number[];
};

export const AUTH_SOCKET_CANCELLED_MESSAGE = 'cancelled by user';

const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
const DEFAULT_RECONNECT_BACKOFF_MS = [10_000, 10_000, 10_000, 20_000, 20_000, 30_000, 60_000];
const SOCKET_PROTOCOL_VERSION = 1;

export class AuthSocketClient {
  private readonly url: string;
  private readonly getClientKey: () => Promise<string>;
  private readonly client: ReturnType<typeof httpClient>;
  private readonly onState?: (state: AuthSocketState) => void;
  private readonly onRequestToken?: (message: AuthSocketAuthRequestTokenResponse) => void;
  private readonly onError?: (message: string) => void;
  private readonly connectTimeoutMs: number;
  private readonly maxReconnectAttempts: number;

  public reconnectBackoff: number[];

  private socket: { close: () => void } | null = null;
  private socketAbortController: AbortController | null = null;
  private socketPromise: Promise<TokensData> | undefined;
  private resolveStart: ((tokens: TokensData) => void) | null = null;
  private rejectStart: ((error: Error) => void) | null = null;
  private connectTimeoutTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private aborted = false;
  /** Last request_token from the server; sent on hello after reconnect so the backend can resume. */
  private lastRequestToken: string | null = null;
  private readonly returnTo?: string;

  constructor(options: AuthSocketOptions) {
    this.url = options.url;
    this.getClientKey = options.getClientKey;
    this.returnTo = options.returnTo;
    this.client = httpClient({
      baseUrl: options.url,
      retrieveGuestSensitiveAuth: async () => '',
      retrieveGuestAuth: async () => '',
      retrieveAccessTokenAuth: async () => '',
      retrieveLegacyAccessTokenAuth: async () => '',
      retrieveUserAuth: async () => '',
      encryptCallback: async () => {
        throw new Error('encryption callback not enabled');
      },
      decryptCallback: async () => {
        throw new Error('decryption callback not enabled');
      },
      deviceId: '',
    });
    this.onState = options.onState;
    this.onRequestToken = options.onRequestToken;
    this.onError = options.onError;
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this.reconnectBackoff = options.reconnectBackoff ?? [...DEFAULT_RECONNECT_BACKOFF_MS];
  }

  start(): Promise<TokensData> {
    if (this.socketPromise) return this.socketPromise;
    this.aborted = false;
    this.reconnectAttempts = 0;
    this.lastRequestToken = null;

    this.socketPromise = new Promise<TokensData>((resolve, reject) => {
      this.resolveStart = resolve;
      this.rejectStart = reject;
      this.openSocket();
    }).finally(() => {
      this.socketPromise = undefined;
      this.resolveStart = null;
      this.rejectStart = null;
      this.clearTimers();
    });

    return this.socketPromise;
  }

  abort(): void {
    if (this.aborted) return;
    this.aborted = true;
    this.lastRequestToken = null;
    this.clearTimers();
    this.cleanupSocket();
    const reject = this.rejectStart;
    this.rejectStart = null;
    this.resolveStart = null;
    reject?.(new Error(AUTH_SOCKET_CANCELLED_MESSAGE));
  }

  private openSocket(): void {
    if (this.aborted || !this.resolveStart) return;

    this.clearConnectTimeout();
    this.cleanupSocket();

    this.onState?.(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const controller = new AbortController();
    this.socketAbortController = controller;

    this.connectTimeoutTimer = window.setTimeout(() => {
      if (this.aborted) return;
      this.onError?.('Connection timed out');
      this.cleanupSocket();
      this.handleDisconnected();
    }, this.connectTimeoutMs);
    void this.startSocket(controller);
  }

  private async startSocket(controller: AbortController): Promise<void> {
    if (this.aborted) return;
    try {
      const hello: AuthSocketClientHello = {
        client_key: await this.getClientKey(),
        protocol_version: SOCKET_PROTOCOL_VERSION,
        request_token: this.lastRequestToken ?? undefined,
        return_to: this.returnTo
      };
      const socket = await this.client.AuthSocket(hello, (result) => this.handleMessage(result), controller.signal, {
        onOpen: () => {
          if (this.aborted || this.socketAbortController !== controller) return;
          this.clearConnectTimeout();
          this.reconnectAttempts = 0;
          this.onState?.('connected');
        },
        onClose: () => {
          if (this.aborted || this.socketAbortController !== controller) return;
          this.handleDisconnected();
        }
      });

      if (this.aborted || this.socketAbortController !== controller) {
        socket.close();
        return;
      }
      this.socket = socket;
    } catch {
      if (this.aborted || this.socketAbortController !== controller) return;
      this.terminalReject(new Error('Failed to initialize websocket auth'));
    }
  }

  private handleMessage(
    message: ResultError | ({ status: 'OK' } & AuthSocketResponse)
  ): void {
    if (this.aborted) return;
    if (message.status === 'ERROR') {
      this.terminalReject(new Error(message.reason || 'Socket auth failed'));
      return;
    }

    if (message.payload.type === AuthSocketResponse_payload_type.REQUEST_TOKEN) {
      this.lastRequestToken = message.payload.request_token.request_token;
      this.onRequestToken?.(message.payload.request_token);
      return;
    }

    if (message.payload.type === AuthSocketResponse_payload_type.TOKENS) {
      this.lastRequestToken = null;
      const resolve = this.resolveStart;
      this.cleanupSocket();
      resolve?.(message.payload.tokens);
    }
  }

  private handleDisconnected(): void {
    this.clearConnectTimeout();
    if (this.aborted) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.terminalReject(new Error('WebSocket reconnection limit reached'));
      return;
    }

    const idx = Math.min(this.reconnectAttempts, this.reconnectBackoff.length - 1);
    const delay = this.reconnectBackoff[idx] ?? this.reconnectBackoff[this.reconnectBackoff.length - 1];
    this.reconnectAttempts += 1;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private terminalReject(err: Error): void {
    this.onError?.(err.message);
    const reject = this.rejectStart;
    this.rejectStart = null;
    this.resolveStart = null;
    this.cleanupSocket();
    reject?.(err);
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutTimer !== null) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearConnectTimeout();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private cleanupSocket(): void {
    this.socketAbortController?.abort();
    this.socketAbortController = null;
    if (!this.socket) return;
    const socket = this.socket;
    this.socket = null;
    try {
      socket.close();
    } catch {
      /* noop */
    }
  }
}
