import type { AuthState, TokensData, WidgetMountOptions, WidgetTheme } from '../types';
import { ErrorCode, SanctumDKError } from '../core/errors';
import type { SessionManager } from '../session/sessionManager';
import type { TypedEventBus } from '../core/events';
import type { ClientKeyStore } from '../storage/clientKeyStore';
import { AUTH_SOCKET_CANCELLED_MESSAGE, AuthSocketClient } from './authSocketClient';
import { checkMarkIcon, hourglassIcon, logoutIcon, settingsIcon } from './icons';
import SANCTUM_LOGO_DARK from './SANCTUM_dark.svg';
import SANCTUM_LOGO_LIGHT from './SANCTUM_light.svg';
import { getWidgetStylesheetText } from './shadowCss';

type WidgetControllerDeps = {
  sanctumUrl: string;
  websocketUrl: string;
  session: SessionManager;
  events: TypedEventBus;
  clientKeyStore: ClientKeyStore;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class WidgetController {
  private static sharedStylesheet: CSSStyleSheet | null = null;
  private static sharedStyleText: string | null = null;
  // Closed shadow roots can't be read back from the host or removed,
  // so remounting (React StrictMode, a new client on the same element) must reuse the one we attached.
  private static shadowRoots = new WeakMap<HTMLElement, ShadowRoot>();

  private static shadowRootFor(host: HTMLElement): ShadowRoot {
    let root = WidgetController.shadowRoots.get(host);
    if (!root) {
      root = host.attachShadow({ mode: 'closed' });
      WidgetController.shadowRoots.set(host, root);
    }
    return root;
  }


  private hostElement: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private mountNode: HTMLElement | null = null;
  private socket: AuthSocketClient;
  private deps: WidgetControllerDeps;
  private destroyed = false;
  private mounted = false;
  private themeMode: WidgetTheme = 'system';
  private openAuthWindow?: (url: string) => Window | null;
  private showLogoutButton = true;
  private status: AuthState = 'idle';
  private requestToken: string | null = null;
  private expiresAt = 0;
  private timer: number | null = null;
  private lastError: string | null = null;
  private promptConfirmLogout = false;
  private displayIdentifier = '';
  private clientKeyDisplay = '';
  private unsubscribeToken?: () => void;
  private readonly themePreferenceQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  constructor(deps: WidgetControllerDeps) {
    this.deps = deps;
    this.socket = new AuthSocketClient({
      url: this.deps.websocketUrl,
      getClientKey: () => this.deps.clientKeyStore.getClientKey(),
      onState: (s) => {
        if (s === 'reconnecting') this.setStatus('reconnecting');
        if (s === 'connecting') this.setStatus('connecting');
      },
      onRequestToken: ({ request_token, expires_at }) => {
        this.requestToken = request_token;
        this.expiresAt = expires_at;
        this.openAuthRequest();
        this.setStatus('awaiting_confirmation');
        this.startTimer();
      },
      onError: (msg) => {
        this.lastError = msg;
      }
    });
  }

  mount(options: WidgetMountOptions): void {
    if (this.destroyed) {
      throw new SanctumDKError('Client already destroyed', ErrorCode.ALREADY_DESTROYED, false);
    }
    const container = document.getElementById(options.containerId);
    if (!container) {
      throw new SanctumDKError(
        `Container "${options.containerId}" not found`,
        ErrorCode.WIDGET_CONTAINER_NOT_FOUND,
        false
      );
    }
    if (this.mounted) {
      this.unmount();
    }
    this.hostElement = container;
    this.shadowRoot = WidgetController.shadowRootFor(container);
    this.shadowRoot.innerHTML = '';
    this.mountNode = document.createElement('div');
    this.mountNode.className = 'sanctum-widget-mount';
    this.shadowRoot.appendChild(this.mountNode);
    this.mountNode.addEventListener('click', this.handleMountClick);
    this.themeMode = options.theme ?? 'system';
    this.openAuthWindow = options.openAuthWindow;
    this.showLogoutButton = options.showLogoutButton !== false;
    this.mounted = true;

    if (this.themePreferenceQuery) {
      if (typeof this.themePreferenceQuery.addEventListener === 'function') {
        this.themePreferenceQuery.addEventListener('change', this.handleThemePreferenceChange);
      } else {
        this.themePreferenceQuery.addListener(this.handleThemePreferenceChange);
      }
    }

    this.unsubscribeToken = this.deps.events.on('tokenChange', (t) => {
      if (!this.mounted) return;
      if (t) {
        this.displayIdentifier = this.formatIdentifier(t.account_identifier || t.identifier);
        this.status = 'authenticated';
        this.render();
      } else {
        this.promptConfirmLogout = false;
        this.displayIdentifier = '';
        if (this.status === 'authenticated') {
          this.status = 'idle';
        }
        this.render();
      }
    });

    void this.bootstrapFromSession();
  }

  unmount(): void {
    this.socket.abort();
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.unsubscribeToken?.();
    this.unsubscribeToken = undefined;
    if (this.mountNode) {
      this.mountNode.removeEventListener('click', this.handleMountClick);
    }
    if (this.themePreferenceQuery) {
      if (typeof this.themePreferenceQuery.removeEventListener === 'function') {
        this.themePreferenceQuery.removeEventListener('change', this.handleThemePreferenceChange);
      } else {
        this.themePreferenceQuery.removeListener(this.handleThemePreferenceChange);
      }
    }
    if (this.shadowRoot) {
      this.shadowRoot.innerHTML = '';
    }
    this.hostElement = null;
    this.shadowRoot = null;
    this.mountNode = null;
    this.mounted = false;
    this.status = 'idle';
    this.promptConfirmLogout = false;
    this.lastError = null;
  }

  setTheme(theme: WidgetTheme): void {
    this.themeMode = theme;
    this.render();
  }

  destroy(): void {
    this.unmount();
    this.destroyed = true;
  }

  private handleMountClick = (e: MouseEvent): void => {
    const el = (e.target as HTMLElement | null)?.closest('[data-sa-action]') as HTMLElement | null;
    if (!el || !this.mountNode?.contains(el)) return;
    const action = el.getAttribute('data-sa-action');
    switch (action) {
      case 'connect':
        this.handleConnectClick();
        break;
      case 'cancel':
        this.handleCancel();
        break;
      case 'logout-prompt':
        this.promptConfirmLogout = true;
        this.render();
        break;
      case 'logout-yes':
        this.handleLogout();
        break;
      case 'logout-no':
        this.promptConfirmLogout = false;
        this.render();
        break;
      case 'retry':
        this.handleConnectClick();
        break;
      default:
        break;
    }
  };

  private handleThemePreferenceChange = (): void => {
    if (this.themeMode === 'system') {
      this.render();
    }
  };

  private async bootstrapFromSession(): Promise<void> {
    if (!this.mounted) return;
    try {
      const [token, clientKey] = await Promise.all([
        this.deps.session.getTokenData(),
        this.deps.clientKeyStore.getClientKey()
      ]);
      this.clientKeyDisplay = clientKey;
      if (token) {
        this.displayIdentifier = this.formatIdentifier(token.account_identifier || token.identifier);
        this.status = 'authenticated';
      }
    } catch {
      // keep defaults
    }
    this.render();
  }

  private effectiveTheme(): 'dark' | 'light' {
    if (this.themeMode === 'system') {
      return this.themePreferenceQuery?.matches ? 'dark' : 'light';
    }
    return this.themeMode;
  }

  private setStatus(state: AuthState): void {
    this.status = state;
    this.deps.events.emit('authStateChanged', state);
    this.render();
  }

  private startAuthFlow(): void {
    if (!this.mounted) return;
    this.lastError = null;
    this.socket.abort();

    void this.socket
      .start()
      .then(async (tokens: TokensData) => {
        await this.deps.session.setTokenData(tokens);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === AUTH_SOCKET_CANCELLED_MESSAGE) return;
        if (err instanceof Error && !this.lastError) {
          this.lastError = err.message;
        }
        this.setStatus('error');
      })
      .finally(() => {
        this.stopTimer();
      });
  }

  private openAuthRequest(): void {
    if (!this.requestToken) return;
    const authUrl = new URL(`/auth/requestToken/${this.requestToken}`, this.deps.sanctumUrl).toString();
    if (this.openAuthWindow) {
      this.openAuthWindow(authUrl);
      return;
    }
    window.open(authUrl, '_blank');
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = window.setInterval(() => this.render(), 1000);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private secondsLeft(): number {
    return Math.max(0, Math.round((this.expiresAt - Date.now()) / 1000));
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private formatIdentifier(identifier?: string | null): string {
    if (!identifier) return '';
    if (identifier.includes('@')) {
      const [localPart, domain] = identifier.split('@');
      if (localPart.length > 3) {
        return `${localPart.slice(0, 3)}...@${domain}`;
      }
      return identifier;
    }
    if (identifier.startsWith('npub')) {
      return `${identifier.slice(0, 10)}...${identifier.slice(-10)}`;
    }
    return identifier;
  }

  /** Inline SVG with fixed size for template strings (trusted source: icons.ts). */
  private sizedSvg(svg: string): string {
    return svg.includes(' width=') ? svg : svg.replace('<svg ', '<svg width="20" height="20" ');
  }

  private applySpinnerAnimation(svg: SVGElement | null): void {
    if (!svg || !('animate' in svg)) return;
    svg.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
      { duration: 1100, iterations: Infinity, easing: 'linear' }
    );
  }

  private handleCancel(): void {
    this.socket.abort();
    this.stopTimer();
    this.setStatus('idle');
  }

  private handleLogout(): void {
    void this.deps.session.clear();
    this.promptConfirmLogout = false;
    this.setStatus('idle');
  }

  private handleConnectClick(): void {
    if (this.status === 'connecting' || this.status === 'reconnecting' || this.status === 'awaiting_confirmation') {
      return;
    }
    this.lastError = null;
    this.setStatus('connecting');
    void this.startAuthFlow();
  }

  private ensureStyles(): void {
    if (!this.shadowRoot) return;
    const styleId = 'sanctum-sdk-widget-styles';
    const styles = getWidgetStylesheetText();

    if (!WidgetController.sharedStyleText) {
      WidgetController.sharedStyleText = styles;
    }

    const supportsConstructableStylesheets =
      typeof CSSStyleSheet !== 'undefined' &&
      typeof CSSStyleSheet.prototype.replaceSync === 'function' &&
      'adoptedStyleSheets' in this.shadowRoot;

    if (supportsConstructableStylesheets) {
      if (!WidgetController.sharedStylesheet) {
        const stylesheet = new CSSStyleSheet();
        stylesheet.replaceSync(WidgetController.sharedStyleText!);
        WidgetController.sharedStylesheet = stylesheet;
      }
      if (!this.shadowRoot.adoptedStyleSheets.includes(WidgetController.sharedStylesheet)) {
        this.shadowRoot.adoptedStyleSheets = [
          ...this.shadowRoot.adoptedStyleSheets,
          WidgetController.sharedStylesheet
        ];
      }
      return;
    }

    if (this.shadowRoot.querySelector(`#${styleId}`)) {
      return;
    }
    const styleElement = document.createElement('style');
    styleElement.id = styleId;
    styleElement.textContent = WidgetController.sharedStyleText!;
    this.shadowRoot.insertBefore(styleElement, this.shadowRoot.firstChild);
  }

  private buildContentHtml(): string {
    const s = this.status;
    const spin = this.sizedSvg(settingsIcon);
    const hour = this.sizedSvg(hourglassIcon);
    const check = this.sizedSvg(checkMarkIcon);
    const out = this.sizedSvg(logoutIcon);

    switch (s) {
      case 'connecting':
        return `
          <div class="sanctum-alt-view-container flex-col items-center justify-center gap-3 w-full flex-center gap-2">
            <span class="inline-flex items-center sanctum-widget-icon sanctum-spin-wrap">${spin}</span>
            <span class="body-sm text-muted">Connecting to Sanctum...</span>
          </div>`;
      case 'reconnecting':
        return `
          <div class="sanctum-alt-view-container flex-col items-center justify-center gap-3 w-full flex-center gap-2">
            <span class="inline-flex items-center sanctum-widget-icon sanctum-spin-wrap">${spin}</span>
            <span class="body-sm text-muted">Reconnecting...</span>
            <button type="button" class="btn-sm btn-ghost sanctum-cancel-button" data-sa-action="cancel">Cancel</button>
          </div>`;
      case 'awaiting_confirmation':
        return `
          <div class="sanctum-alt-view-container flex-col items-center justify-center gap-3 w-full">
            <div class="body-sm text-muted text-center">Awaiting confirmation in Sanctum</div>
            <div class="flex-center gap-2">
              <span class="inline-flex items-center sanctum-widget-icon">${hour}</span>
              <span class="timer-num mono text-color">${escapeHtml(this.formatTime(this.secondsLeft()))}</span>
            </div>
            <button type="button" class="btn-sm btn-ghost sanctum-cancel-button" data-sa-action="cancel">Cancel</button>
          </div>`;
      case 'authenticated':
        if (this.showLogoutButton && this.promptConfirmLogout) {
          return `
            <div class="sanctum-alt-view-container flex-col items-center justify-center gap-3 w-full">
              <span class="h6 text-center">Log out?</span>
              <div class="flex-center gap-2">
                <button type="button" class="btn btn-sa sanctum-login-button" data-sa-action="logout-yes">Yes</button>
                <button type="button" class="btn btn-ghost sanctum-login-button" data-sa-action="logout-no">No</button>
              </div>
            </div>`;
        }
        {
          const top =
            this.showLogoutButton
              ? `<div class="flex justify-end w-full">
                   <button type="button" class="btn-sm btn-ghost sanctum-logout-button inline-flex items-center gap-1" data-sa-action="logout-prompt">
                     <span class="inline-flex items-center sanctum-widget-icon">${out}</span> Log out
                   </button>
                 </div>`
              : '';
          const clientLine = this.clientKeyDisplay
            ? `<span class="mono text-dim">client_id-${escapeHtml(this.clientKeyDisplay)}</span>`
            : '';
          return `
            <div class="sanctum-alt-view-container flex-col items-center justify-center gap-3 w-full confirmed gap-2">
              ${top}
              <div class="flex-center gap-2">
                <span class="inline-flex items-center sanctum-widget-icon">${check}</span>
                <span class="pill pill-sa pill--dot">Connected</span>
              </div>
              <span class="mono text-dim">${escapeHtml(this.displayIdentifier)}</span>
              ${clientLine}
            </div>`;
        }
      case 'error':
        return `
          <div class="sanctum-alt-view-container flex-col items-center justify-center gap-3 w-full">
            <span class="h6 text-center">An error occured</span>
            <span class="body-sm text-muted text-center">${escapeHtml(this.lastError ?? 'Unknown error')}</span>
            <div class="flex-center">
              <button type="button" class="btn btn-sa sanctum-login-button" data-sa-action="retry">Try again</button>
            </div>
          </div>`;
      default:
        return `
          <div class="sanctum-alt-view-container flex-col items-center justify-center gap-3 w-full flex-center">
            <button type="button" class="btn btn-sa sanctum-login-button" data-sa-action="connect">Connect with Sanctum</button>
          </div>`;
    }
  }

  private buildLogoHtml(theme: 'dark' | 'light'): string {
    const powered =
      this.status !== 'awaiting_confirmation' && this.status !== 'authenticated'
        ? '<span class="mono text-dim">Powered by</span>'
        : '';
    const logoSrc = theme === 'dark' ? SANCTUM_LOGO_DARK : SANCTUM_LOGO_LIGHT;
    return `
      <div class="sanctum-logo flex-col items-center gap-1 w-full">
        ${powered}
        <div class="flex-center">
          <img class="sanctum-widget-logo" src="${logoSrc}" alt="Sanctum" width="132" height="29" />
        </div>
      </div>`;
  }

  private render(): void {
    if (!this.mountNode || !this.hostElement) return;
    this.ensureStyles();

    const theme = this.effectiveTheme();
    this.hostElement.setAttribute('data-product', 'sanctum');
    this.hostElement.setAttribute('data-theme', theme);

    const contentHtml = this.buildContentHtml();
    const logoHtml = this.buildLogoHtml(theme);
    this.mountNode.innerHTML = `
      <div class="sanctum-widget-root card card-sm flex-col items-center justify-center gap-3 w-full" data-product="sanctum" data-theme="${theme}">
        ${contentHtml}
        ${logoHtml}
      </div>`;

    if (this.status === 'connecting' || this.status === 'reconnecting') {
      const wrap = this.mountNode.querySelector('.sanctum-spin-wrap svg') as SVGElement | null;
      this.applySpinnerAnimation(wrap);
    }
  }
}
