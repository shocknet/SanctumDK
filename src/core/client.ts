import type { SanctumDKConfig, SanctumDK, SanctumDKEvents, SessionApi, TokensData } from '../types';
import { TypedEventBus } from './events';
import { getDefaultStorageAdapter } from '../storage/defaultStorage';
import { createStorageTokenDataAdapter } from '../storage/tokenStore';
import { ClientKeyStore } from '../storage/clientKeyStore';
import { SessionManager } from '../session/sessionManager';
import { ApiFacade } from '../api/apiFacade';
import { WidgetController } from '../widget/widgetController';

const deriveWebsocketUrl = (url: string): string => {
  return url.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
};

const assertUrl = (name: string, value: string): void => {
  try {
    new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL: ${value}`);
  }
};

export const createSanctumDK = (config: SanctumDKConfig): SanctumDK => {
  assertUrl('url', config.url);
  const baseUrl = config.url.replace(/\/+$/, '');
  const rawWebsocketUrl = config.websocketUrl ?? deriveWebsocketUrl(baseUrl);
  assertUrl('websocketUrl', rawWebsocketUrl);
  const websocketUrl = rawWebsocketUrl.replace(/\/+$/, '');

  const storageAdapter = config.storageAdapter ?? getDefaultStorageAdapter();
  const tokenDataAdapter = config.tokenDataAdapter ?? createStorageTokenDataAdapter(storageAdapter);

  const events = new TypedEventBus();
  const session = new SessionManager(tokenDataAdapter, events);
  const clientKeyStore = new ClientKeyStore(storageAdapter, config.getClientKey);
  const apiFacade = new ApiFacade({
    baseUrl,
    session,
    events,
    clientKeyStore,
  });
  const widgetController = new WidgetController({
    sanctumUrl: baseUrl,
    websocketUrl,
    session,
    events,
    clientKeyStore,
    returnTo: config.returnTo,
    lifecycleAdapter: config.lifecycleAdapter
  });

  const eventApi: SanctumDKEvents = {
    onTokenChange: (handler) => events.on('tokenChange', handler),
    onTokensUpdated: (handler) => events.on('tokensUpdated', handler),
    onReauthRequired: (handler) => events.on('reauthRequired', handler),
    onAuthStateChanged: (handler) => events.on('authStateChanged', handler)
  };

  const sessionApi: SessionApi = {
    getTokenData: () => session.getTokenData(),
    setTokenData: (tokensData: TokensData) => session.setTokenData(tokensData),
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
