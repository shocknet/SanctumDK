# SanctumDK

Instance-based Sanctum browser SDK (SanctumDK) designed for predictable lifecycle behavior and stronger developer ergonomics.

## Design Goals

- No global mutable runtime state
- Explicit client lifecycle (`destroy`)
- Typed event subscriptions (no global callback overwrite)
- Single-flight token refresh with deterministic reauth handling
- Closed-shadow widget boundary (host apps cannot style or inspect internals)

## Install

```bash
npm install sanctum-dk
```

## Quick Start

```ts
import { createSanctumDK } from 'sanctum-dk';

const client = createSanctumDK({
  url: 'https://auth.shock.network',
  websocketUrl: 'wss://auth.shock.network'
});

const offToken = client.events.onTokenChange((token) => {
  console.log('Token changed', token);
});

const offAuthState = client.events.onAuthStateChanged((state) => {
  console.log('Auth state', state);
});

client.widget.mount({
  containerId: 'sanctum-widget',
  theme: 'system'
});

const pubkey = await client.api.getPublicKey();
console.log(pubkey);

offToken();
offAuthState();
await client.destroy();
```

## API Surface

### `createSanctumDK(config)`

Creates an isolated client instance. Multiple instances can exist without sharing state.

Config:

- `url` (required)
- `websocketUrl` (optional, derived from `url` if omitted)
- `storageAdapter` (optional)
- `tokenDataAdapter` (optional)
- `getClientKey` (optional)

### `client.api`

- `getPublicKey()`
- `getRelays()`
- `signEvent(eventJsonString)`
- `encrypt(plaintext, pubkey)`
- `decrypt(ciphertext, pubkey)`
- `createAuthHeader(url, method, body?)`

### `client.session`

- `getTokenData()`
- `setTokenData(tokensData)`
- `clear()`

### `client.widget`

- `mount({ containerId, theme?, openAuthWindow?, showLogoutButton? })`
- `setTheme(theme)`
- `unmount()`

Widget internals run inside a **closed shadow root** and are intentionally not customizable.

### `client.events`

- `onTokenChange(handler)`
- `onTokensUpdated(handler)`
- `onReauthRequired(({ reason }) => ...)`
- `onAuthStateChanged(handler)`

All event APIs return `unsubscribe`.

### Errors

- `SanctumDKError`
- `ErrorCode`

Most API methods throw `SanctumDKError` on failure.

## Lifecycle notes

- `createSanctumDK(...)` is synchronous wiring (no network calls).
- `client.widget.mount(...)` attaches DOM listeners, starts the widget auth flow when the user clicks connect, and updates UI based on session/events.
- `client.destroy()` is the instance-level teardown:
  - unmounts/destroys the widget (future `widget.mount(...)` on the same instance will throw)
  - clears all event handlers registered through `client.events`
  - does **not** clear persisted tokens/session storage (use `client.session.clear()` for logout)
- Mounting on an element that already hosts a Sanctum widget (React StrictMode, a new client on the same element) rebuilds the widget in place.

## Multiple tabs

Refresh tokens are single-use. Clients that share token storage refresh under a Web Locks API lock (`navigator.locks`), one tab at a time. After waiting for the lock, a client re-reads its tokens; if another tab already swapped the refresh token, it uses those instead of refreshing again.

This only works if `tokenDataAdapter.getTokenData()` reads the shared storage every time, not a copy cached in memory. The default `storageAdapter` (`localStorage`) already does.

## Reauth Behavior

The client always routes these errors through the same reauth path:

- `REFRESH_TOKEN_EXPIRED`
- `REFRESH_TOKEN_INVALID`
- `REFRESH_TOKEN_REPLAYED`
- `GRANT_REVOKED`

Reauth path:

1. token storage cleared
2. `onReauthRequired` emitted
3. API call throws `SanctumDKError` with `recoverable=false`

## Development

```bash
npm install
npm run build
npm run test
npm run serve
```
