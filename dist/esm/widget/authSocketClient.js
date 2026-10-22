import httpClient from '../proto/http_client.js';
import { AuthSocketResponse_payload_type } from '../proto/types.js';

const AUTH_SOCKET_CANCELLED_MESSAGE = 'cancelled by user';
const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
// First retry is short: the approval screen backgrounds this page, the socket
// drops, and this delay is what the user waits through after they come back.
const DEFAULT_RECONNECT_BACKOFF_MS = [250, 1000, 2000, 5000, 10000];
const SOCKET_PROTOCOL_VERSION = 1;
class AuthSocketClient {
    constructor(options) {
        this.socket = null;
        this.socketAbortController = null;
        this.resolveStart = null;
        this.rejectStart = null;
        this.connectTimeoutTimer = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.aborted = false;
        /** Drop or pending retry happened while hidden or paused. Dial on return instead of spending retries. */
        this.parkedUntilForeground = false;
        /** Capacitor/Cordova app pause. Visibility is read live, so a hidden start still unparks. */
        this.paused = false;
        /** False after hide/pause, so a dial still open from before that is stale when we return. */
        this.dialWhileInFront = false;
        this.foregroundBound = false;
        /** Last request_token from the server; sent on hello after reconnect so the backend can resume. */
        this.lastRequestToken = null;
        this.onVisibilityChange = () => {
            if (this.pageHidden()) {
                this.markAway();
                return;
            }
            this.resumeFromBackground();
        };
        this.onPause = () => {
            this.paused = true;
            this.markAway();
        };
        this.onResume = () => {
            this.paused = false;
            this.resumeFromBackground();
        };
        this.onFocus = () => {
            this.resumeFromBackground();
        };
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
    start() {
        if (this.socketPromise)
            return this.socketPromise;
        this.aborted = false;
        this.reconnectAttempts = 0;
        this.lastRequestToken = null;
        this.parkedUntilForeground = false;
        this.paused = false;
        this.dialWhileInFront = false;
        this.bindForegroundSignals();
        this.socketPromise = new Promise((resolve, reject) => {
            this.resolveStart = resolve;
            this.rejectStart = reject;
            this.openSocket();
        }).finally(() => {
            this.socketPromise = undefined;
            this.resolveStart = null;
            this.rejectStart = null;
            this.parkedUntilForeground = false;
            this.unbindForegroundSignals();
            this.clearTimers();
        });
        return this.socketPromise;
    }
    abort() {
        if (this.aborted)
            return;
        this.aborted = true;
        this.lastRequestToken = null;
        this.parkedUntilForeground = false;
        this.paused = false;
        this.unbindForegroundSignals();
        this.clearTimers();
        this.cleanupSocket();
        const reject = this.rejectStart;
        this.rejectStart = null;
        this.resolveStart = null;
        reject?.(new Error(AUTH_SOCKET_CANCELLED_MESSAGE));
    }
    openSocket() {
        if (this.aborted || !this.resolveStart)
            return;
        if (this.awayFromPage()) {
            this.parkUntilForeground();
            return;
        }
        this.parkedUntilForeground = false;
        this.dialWhileInFront = true;
        this.clearConnectTimeout();
        this.cleanupSocket();
        const rejoining = this.reconnectAttempts > 0 || this.lastRequestToken !== null;
        this.onState?.(rejoining ? 'reconnecting' : 'connecting');
        const controller = new AbortController();
        this.socketAbortController = controller;
        this.connectTimeoutTimer = window.setTimeout(() => {
            if (this.aborted)
                return;
            this.onError?.('Connection timed out');
            this.cleanupSocket();
            this.handleDisconnected();
        }, this.connectTimeoutMs);
        void this.startSocket(controller);
    }
    async startSocket(controller) {
        if (this.aborted)
            return;
        try {
            const hello = {
                client_key: await this.getClientKey(),
                protocol_version: SOCKET_PROTOCOL_VERSION,
                request_token: this.lastRequestToken ?? undefined,
                return_to: this.returnTo
            };
            const socket = await this.client.AuthSocket(hello, (result) => this.handleMessage(result), controller.signal, {
                onOpen: () => {
                    if (this.aborted || this.socketAbortController !== controller)
                        return;
                    this.clearConnectTimeout();
                    this.reconnectAttempts = 0;
                    this.onState?.('connected');
                },
                onClose: () => {
                    if (this.aborted || this.socketAbortController !== controller)
                        return;
                    this.handleDisconnected();
                }
            });
            if (this.aborted || this.socketAbortController !== controller) {
                socket.close();
                return;
            }
            this.socket = socket;
        }
        catch {
            if (this.aborted || this.socketAbortController !== controller)
                return;
            this.terminalReject(new Error('Failed to initialize websocket auth'));
        }
    }
    handleMessage(message) {
        if (this.aborted)
            return;
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
    handleDisconnected() {
        this.clearConnectTimeout();
        if (this.aborted)
            return;
        // Hidden or paused pages fail the dial and would spend a retry. Wait until the page is back.
        if (this.awayFromPage()) {
            this.parkUntilForeground();
            return;
        }
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.terminalReject(new Error('WebSocket reconnection limit reached'));
            return;
        }
        this.scheduleReconnect();
    }
    scheduleReconnect() {
        const idx = Math.min(this.reconnectAttempts, this.reconnectBackoff.length - 1);
        const delay = this.reconnectBackoff[idx] ?? this.reconnectBackoff[this.reconnectBackoff.length - 1];
        this.reconnectAttempts += 1;
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.openSocket();
        }, delay);
    }
    parkUntilForeground() {
        this.parkedUntilForeground = true;
        this.clearTimers();
    }
    awayFromPage() {
        return this.paused || this.pageHidden();
    }
    pageHidden() {
        return typeof document !== 'undefined' && document.visibilityState === 'hidden';
    }
    markAway() {
        this.dialWhileInFront = false;
        if (this.reconnectTimer === null)
            return;
        this.parkUntilForeground();
    }
    resumeFromBackground() {
        if (this.aborted || !this.resolveStart)
            return;
        if (this.awayFromPage())
            return;
        const hungDial = this.connectTimeoutTimer !== null && !this.dialWhileInFront;
        const waiting = this.parkedUntilForeground || this.reconnectTimer !== null || hungDial;
        if (!waiting)
            return;
        this.parkedUntilForeground = false;
        this.clearTimers();
        this.openSocket();
    }
    bindForegroundSignals() {
        if (this.foregroundBound || typeof document === 'undefined')
            return;
        document.addEventListener('visibilitychange', this.onVisibilityChange);
        document.addEventListener('pause', this.onPause);
        document.addEventListener('resume', this.onResume);
        window.addEventListener('focus', this.onFocus);
        this.foregroundBound = true;
    }
    unbindForegroundSignals() {
        if (!this.foregroundBound || typeof document === 'undefined')
            return;
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
        document.removeEventListener('pause', this.onPause);
        document.removeEventListener('resume', this.onResume);
        window.removeEventListener('focus', this.onFocus);
        this.foregroundBound = false;
    }
    terminalReject(err) {
        this.onError?.(err.message);
        const reject = this.rejectStart;
        this.rejectStart = null;
        this.resolveStart = null;
        this.cleanupSocket();
        reject?.(err);
    }
    clearConnectTimeout() {
        if (this.connectTimeoutTimer !== null) {
            clearTimeout(this.connectTimeoutTimer);
            this.connectTimeoutTimer = null;
        }
    }
    clearTimers() {
        this.clearConnectTimeout();
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
    cleanupSocket() {
        this.socketAbortController?.abort();
        this.socketAbortController = null;
        if (!this.socket)
            return;
        const socket = this.socket;
        this.socket = null;
        try {
            socket.close();
        }
        catch {
            /* noop */
        }
    }
}

export { AUTH_SOCKET_CANCELLED_MESSAGE, AuthSocketClient };
//# sourceMappingURL=authSocketClient.js.map
