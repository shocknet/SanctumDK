import type { TokensData } from '../types';
import { type AuthSocketAuthRequestTokenResponse } from '../proto/types';
export type AuthSocketState = 'connecting' | 'reconnecting' | 'connected';
export type AuthSocketOptions = {
    url: string;
    getClientKey: () => Promise<string>;
    onState?: (state: AuthSocketState) => void;
    onRequestToken?: (message: AuthSocketAuthRequestTokenResponse) => void;
    onError?: (message: string) => void;
    connectTimeoutMs?: number;
    maxReconnectAttempts?: number;
    reconnectBackoff?: number[];
};
export declare const AUTH_SOCKET_CANCELLED_MESSAGE = "cancelled by user";
export declare class AuthSocketClient {
    private readonly url;
    private readonly getClientKey;
    private readonly client;
    private readonly onState?;
    private readonly onRequestToken?;
    private readonly onError?;
    private readonly connectTimeoutMs;
    private readonly maxReconnectAttempts;
    reconnectBackoff: number[];
    private socket;
    private socketAbortController;
    private socketPromise;
    private resolveStart;
    private rejectStart;
    private connectTimeoutTimer;
    private reconnectTimer;
    private reconnectAttempts;
    private aborted;
    /** Last request_token from the server; sent on hello after reconnect so the backend can resume. */
    private lastRequestToken;
    constructor(options: AuthSocketOptions);
    start(): Promise<TokensData>;
    abort(): void;
    private openSocket;
    private startSocket;
    private handleMessage;
    private handleDisconnected;
    private terminalReject;
    private clearConnectTimeout;
    private clearTimers;
    private cleanupSocket;
}
