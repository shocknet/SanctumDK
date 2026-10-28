import { TypedEventBus } from './events.js';
import { getDefaultStorageAdapter } from '../storage/defaultStorage.js';
import { createStorageTokenDataAdapter } from '../storage/tokenStore.js';
import { ClientKeyStore } from '../storage/clientKeyStore.js';
import { SessionManager } from '../session/sessionManager.js';
import { ApiFacade } from '../api/apiFacade.js';
import { WidgetController } from '../widget/widgetController.js';

const deriveWebsocketUrl = (url) => {
    return url.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
};
const assertUrl = (name, value) => {
    try {
        new URL(value);
    }
    catch {
        throw new Error(`${name} is not a valid URL: ${value}`);
    }
};
const createSanctumDK = (config) => {
    assertUrl('url', config.url);
    const websocketUrl = config.websocketUrl ?? deriveWebsocketUrl(config.url);
    assertUrl('websocketUrl', websocketUrl);
    const storageAdapter = config.storageAdapter ?? getDefaultStorageAdapter();
    const tokenDataAdapter = config.tokenDataAdapter ?? createStorageTokenDataAdapter(storageAdapter);
    const events = new TypedEventBus();
    const session = new SessionManager(tokenDataAdapter, events);
    const clientKeyStore = new ClientKeyStore(storageAdapter, config.getClientKey);
    const apiFacade = new ApiFacade({
        baseUrl: config.url,
        session,
        events,
        clientKeyStore,
    });
    const widgetController = new WidgetController({
        sanctumUrl: config.url,
        websocketUrl,
        session,
        events,
        clientKeyStore,
        returnTo: config.returnTo
    });
    const eventApi = {
        onTokenChange: (handler) => events.on('tokenChange', handler),
        onTokensUpdated: (handler) => events.on('tokensUpdated', handler),
        onReauthRequired: (handler) => events.on('reauthRequired', handler),
        onAuthStateChanged: (handler) => events.on('authStateChanged', handler)
    };
    const sessionApi = {
        getTokenData: () => session.getTokenData(),
        setTokenData: (tokensData) => session.setTokenData(tokensData),
        clear: () => session.clear()
    };
    return {
        api: apiFacade,
        widget: {
            mount: (options) => widgetController.mount(options),
            unmount: () => widgetController.unmount(),
            setTheme: (theme) => widgetController.setTheme(theme)
        },
        session: sessionApi,
        events: eventApi,
        async destroy() {
            widgetController.destroy();
            events.clear();
        }
    };
};

export { createSanctumDK };
//# sourceMappingURL=client.js.map
