import type { TokensData } from '../types';
import { type AuthSocketAuthRequestTokenResponse } from '../proto/types';
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
    /** Drop or pending retry happened while hidden or paused. Dial on return instead of spending retries. */
    private parkedUntilForeground;
    /** Capacitor/Cordova app pause. Visibility is read live, so a hidden start still unparks. */
    private paused;
    /** False after hide/pause, so a dial still open from before that is stale when we return. */
    private dialWhileInFront;
    private foregroundBound;
    /** Last request_token from the server; sent on hello after reconnect so the backend can resume. */
    private lastRequestToken;
    private readonly returnTo?;
    private readonly onVisibilityChange;
    private readonly onPause;
    private readonly onResume;
    private readonly onFocus;
    constructor(options: AuthSocketOptions);
    start(): Promise<TokensData>;
    abort(): void;
    private openSocket;
    private startSocket;
    private handleMessage;
    private handleDisconnected;
    private scheduleReconnect;
    private parkUntilForeground;
    private awayFromPage;
    private pageHidden;
    private markAway;
    private resumeFromBackground;
    private bindForegroundSignals;
    private unbindForegroundSignals;
    private terminalReject;
    private clearConnectTimeout;
    private clearTimers;
    private cleanupSocket;
}
