import type { TypedEventBus } from '../core/events';
import type { SessionManager } from '../session/sessionManager';
import type { ClientKeyStore } from '../storage/clientKeyStore';
import type { SanctumApi } from '../types';
type ApiFacadeDeps = {
    baseUrl: string;
    session: SessionManager;
    events: TypedEventBus;
    clientKeyStore: ClientKeyStore;
};
export declare class ApiFacade implements SanctumApi {
    private deps;
    private refreshPromise;
    private readonly client;
    constructor(deps: ApiFacadeDeps);
    private requireAuth;
    private requireReauth;
    private isRefreshableAuthError;
    private refreshTokensSingleFlight;
    private refreshAcrossTabs;
    private mintFromRefreshToken;
    private unwrapResult;
    private withRefreshRetry;
    getPublicKey(): Promise<string>;
    getRelays(): Promise<Record<string, {
        read: boolean;
        write: boolean;
    }>>;
    signEvent(event: string): Promise<string>;
    encrypt(plaintext: string, pubkey: string): Promise<string>;
    decrypt(ciphertext: string, pubkey: string): Promise<string>;
    createAuthHeader(url: string, method: string, body?: string): Promise<string>;
}
export {};
