import { ErrorCode, SanctumDKError, isReauthReason } from '../core/errors';
import type { TypedEventBus } from '../core/events';
import type { SessionManager } from '../session/sessionManager';
import type { ClientKeyStore } from '../storage/clientKeyStore';
import httpClient, { type ResultError } from '../proto/http_client';
import type { SanctumApi } from '../types';
import * as Types from '../proto/types';

const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;


type ApiFacadeDeps = {
  baseUrl: string;
  session: SessionManager;
  events: TypedEventBus;
  clientKeyStore: ClientKeyStore;
};

export class ApiFacade implements SanctumApi {
  private refreshPromise: Promise<Types.TokensData> | null = null;
  private readonly client: ReturnType<typeof httpClient>;

  constructor(private deps: ApiFacadeDeps) {
    this.client = httpClient({
      baseUrl: deps.baseUrl,
      retrieveGuestAuth: async () => '',
      retrieveGuestSensitiveAuth: async () => '',
      retrieveAccessTokenAuth: async () => {
        const token = await this.deps.session.getTokenData();
        return token ? `Bearer ${token.access_token}` : null;
      },
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
  }


  private async requireAuth(): Promise<Types.TokensData> {
    const tokenData = await this.deps.session.getTokenData();
    if (!tokenData) {
      throw new SanctumDKError('Not authenticated', ErrorCode.NOT_AUTHENTICATED, false);
    }
    if (Date.now() >= tokenData.refresh_expires_at) {
      return this.requireReauth(ErrorCode.REFRESH_TOKEN_EXPIRED);
    }
    if (Date.now() >= tokenData.expires_at - ACCESS_TOKEN_REFRESH_SKEW_MS) {
      return this.refreshTokensSingleFlight();
    }
    return tokenData;
  }

  private async requireReauth(reason: string): Promise<never> {
    await this.deps.session.clear();
    this.deps.events.emit('reauthRequired', { reason });
    throw new SanctumDKError('Re-authentication required', reason, false);
  }

  private isRefreshableAuthError(reason: string): boolean {
    return reason === ErrorCode.ACCESS_TOKEN_EXPIRED || reason === ErrorCode.ACCESS_TOKEN_INVALID;
  }

  private async refreshTokensSingleFlight(): Promise<Types.TokensData> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = (async () => {
      const current = await this.deps.session.getTokenData();
      if (!current) {
        return this.requireReauth(ErrorCode.REFRESH_TOKEN_INVALID);
      }
      const refresh = await this.client.MintFromRefreshToken({
        refresh_token: current.refresh_token,
      });
      if (refresh.status === 'ERROR') {
        if (isReauthReason(refresh.reason)) {
          return this.requireReauth(refresh.reason);
        }
        throw new SanctumDKError(refresh.reason, refresh.reason);
      }
      await this.deps.session.updateTokensAfterRefresh(refresh);
      return refresh;
    })();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async unwrapResult<T extends object>(promise: Promise<Types.ResultError | ({ status: 'OK' } & T)>): Promise<T> {
    const result = await promise;
    if (result.status === 'OK') {
      const { status: _status, ...payload } = await result;
      return payload as T;
    }
    throw new SanctumDKError(result.reason, result.reason);
  }

  private async withRefreshRetry<T extends object>(fn: () => Promise<Types.ResultError | ({ status: 'OK' } & T)>): Promise<T> {
    try {
      return await this.unwrapResult<T>(fn());
    } catch (error) {
      if (!(error instanceof SanctumDKError)) {
        throw error;
      }
      if (error.code === ErrorCode.GRANT_REVOKED) {
        return this.requireReauth(ErrorCode.GRANT_REVOKED);
      }
      if (!this.isRefreshableAuthError(error.code)) {
        throw error;
      }
      await this.refreshTokensSingleFlight();
      return this.unwrapResult<T>(fn());
    }
  }

  
  async getPublicKey(): Promise<string> {
    await this.requireAuth();
    const result = await this.withRefreshRetry(() => this.client.GetNostrPubKey());
    return result.pubkey;
  }

  async getRelays(): Promise<Record<string, { read: boolean; write: boolean }>> {
    await this.requireAuth();
    const result = await this.withRefreshRetry(() => this.client.GetNostrRelays());
    return result.relays;
  }

  async signEvent(event: string): Promise<string> {
    await this.requireAuth();
    const result = await this.withRefreshRetry(() => this.client.SignNostrEvent({ usignedEvent: event }));
    return result.signedEvent;
  }

  async encrypt(plaintext: string, pubkey: string): Promise<string> {
    await this.requireAuth();
    const result = await this.withRefreshRetry(() => this.client.Nip44Encrypt({ plaintext, pubkey }));
    return result.ciphertext;
  }

  async decrypt(ciphertext: string, pubkey: string): Promise<string> {
    await this.requireAuth();
    const result = await this.withRefreshRetry(() => this.client.Nip44Decrypt({ ciphertext, pubkey }));
    return result.plaintext;
  }

  async createAuthHeader(url: string, method: string, body?: string): Promise<string> {
    await this.requireAuth();
    const result = await this.withRefreshRetry(() => this.client.Nip98Event({
      url,
      method: method.toUpperCase(),
      request_body: body
    }));
    return result.authorization_header;
  }
}
