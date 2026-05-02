import { SanctumDKError, ErrorCode, isReauthReason } from '../core/errors.js';
import httpClient from '../proto/http_client.js';

const ACCESS_TOKEN_REFRESH_SKEW_MS = 60000;
class ApiFacade {
    constructor(deps) {
        this.deps = deps;
        this.refreshPromise = null;
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
    async requireAuth() {
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
    async requireReauth(reason) {
        await this.deps.session.clear();
        this.deps.events.emit('reauthRequired', { reason });
        throw new SanctumDKError('Re-authentication required', reason, false);
    }
    isRefreshableAuthError(reason) {
        return reason === ErrorCode.ACCESS_TOKEN_EXPIRED || reason === ErrorCode.ACCESS_TOKEN_INVALID;
    }
    async refreshTokensSingleFlight() {
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
        }
        finally {
            this.refreshPromise = null;
        }
    }
    async unwrapResult(promise) {
        const result = await promise;
        if (result.status === 'OK') {
            const { status: _status, ...payload } = await result;
            return payload;
        }
        throw new SanctumDKError(result.reason, result.reason);
    }
    async withRefreshRetry(fn) {
        try {
            return await this.unwrapResult(fn());
        }
        catch (error) {
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
            return this.unwrapResult(fn());
        }
    }
    async getPublicKey() {
        await this.requireAuth();
        const result = await this.withRefreshRetry(() => this.client.GetNostrPubKey());
        return result.pubkey;
    }
    async getRelays() {
        await this.requireAuth();
        const result = await this.withRefreshRetry(() => this.client.GetNostrRelays());
        return result.relays;
    }
    async signEvent(event) {
        await this.requireAuth();
        const result = await this.withRefreshRetry(() => this.client.SignNostrEvent({ usignedEvent: event }));
        return result.signedEvent;
    }
    async encrypt(plaintext, pubkey) {
        await this.requireAuth();
        const result = await this.withRefreshRetry(() => this.client.Nip44Encrypt({ plaintext, pubkey }));
        return result.ciphertext;
    }
    async decrypt(ciphertext, pubkey) {
        await this.requireAuth();
        const result = await this.withRefreshRetry(() => this.client.Nip44Decrypt({ ciphertext, pubkey }));
        return result.plaintext;
    }
    async createAuthHeader(url, method, body) {
        await this.requireAuth();
        const result = await this.withRefreshRetry(() => this.client.Nip98Event({
            url,
            method: method.toUpperCase(),
            request_body: body
        }));
        return result.authorization_header;
    }
}

export { ApiFacade };
//# sourceMappingURL=apiFacade.js.map
