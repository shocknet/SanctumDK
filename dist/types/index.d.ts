import { createSanctumDK } from './core/client';
export { createSanctumDK };
export { SanctumDKError, ErrorCode } from './core/errors';
export type { AppLifecycleState, AuthState, LifecycleAdapter, SanctumDKConfig, SanctumDKEvents, SanctumDK, SanctumApi, SanctumStorageAdapter, SessionApi, TokenDataAdapter, TokensData, WidgetMountOptions, WidgetTheme } from './types';
declare global {
    interface Window {
        SanctumDK?: {
            createSanctumDK: typeof createSanctumDK;
        };
    }
}
