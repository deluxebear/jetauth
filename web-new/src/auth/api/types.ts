export interface ResolvedTheme {
  themeType: string;
  colorPrimary: string;
  colorCTA: string;
  colorSuccess: string;
  colorDanger: string;
  colorWarning: string;
  darkColorPrimary: string;
  darkBackground: string;
  borderRadius: number;
  isCompact: boolean;
  isEnabled: boolean;
  fontFamily: string;
  fontFamilyMono: string;
  spacingScale: number;
}

export interface ResolvedThemePayload {
  theme: ResolvedTheme;
  css: string;
}

export interface ResolvedProvider {
  name: string;
  displayName: string;
  type: string;
  logoUrl: string;
  logoUrlDark: string;
  clientId: string;
  /** Secondary client id (WeChat MP/公众号 AppID for in-WeChat-browser flow). */
  clientId2: string;
  /** Tenant / host for providers whose authorize URL is per-instance (Auth0, Okta, ADFS, Casdoor-as-IdP, AzureAD, Nextcloud). */
  domain: string;
  /** Admin-supplied space-separated scopes that override the built-in default. */
  scopes: string;
  /** Full authorize URL for type=Custom providers. */
  customAuthUrl: string;
  /** Secondary id (AzureADB2C user-flow name, WeCom Agent ID, Infoflow Agent ID, ...). */
  appId: string;
  /** Flow-mode selector for multi-mode providers (WeChat Web/Mobile, WeCom Internal/Third-party, Infoflow same). */
  subType: string;
  /** Secondary mode selector (WeCom Silent/Normal). */
  method: string;
  /** Lark toggle: when true, switch to Lark Suite international endpoint instead of Feishu China. */
  disableSsl: boolean;
  prompted: boolean;
  canSignUp: boolean;
  rule: string;
}

export interface SigninMethod {
  name: string;
  displayName: string;
  rule: string;
}

export interface SignupItem {
  name: string;
  visible: boolean;
  required: boolean;
  prompted: boolean;
  type: string;
  customCss: string;
  label: string;
  placeholder: string;
  options: string[];
  regex: string;
  rule: string;
  helper?: string;
  group?: string;
  validationMessage?: Record<string, string>;
  step?: number;
}

export interface SigninItem {
  name: string;
  visible: boolean;
  label: string;
  customCss: string;
  placeholder: string;
  rule: string;
  isCustom: boolean;
  /**
   * Required flag. Only meaningful for Agreement (must-check-before-submit).
   * Optional for backward compat with stored rows that pre-date the field.
   */
  required?: boolean;
  /**
   * For the row with `name === "Providers"` only. Per-provider render config
   * applied on the login page. When undefined or empty, all providers render
   * in server order at the default (small) size — backward-compatible default.
   *
   * - `name` — provider name (unique key, must match a configured provider)
   * - `size` — "large" (full-width button with display name) or "small" (icon-only)
   * - `group` — "primary" (top group) or "secondary" (below divider)
   * - `visible` — default true; `false` hides the button from the login page
   */
  providers?: SigninItemProvider[];
}

export interface SigninItemProvider {
  name: string;
  size: "large" | "small";
  group: "primary" | "secondary";
  visible?: boolean;
}

export interface AuthApplication {
  name: string;
  organization: string;
  displayName: string;
  logo: string;
  favicon: string;
  title: string;
  homepageUrl: string;
  enablePassword: boolean;
  enableSignUp: boolean;
  enableGuestSignin: boolean;
  disableSignin: boolean;
  enableAutoSignin: boolean;
  enableCodeSignin: boolean;
  enableWebAuthn: boolean;
  orgChoiceMode: string;
  signinMethodMode?: string; // "" | "classic" — "" = identifier-first default
  formOffset: number;
  formBackgroundUrl: string;
  formBackgroundUrlMobile: string;
  formCss: string;
  formCssMobile: string;
  formSideHtml: string;
  headerHtml: string;
  footerHtml: string;
  signinHtml: string;
  signupHtml: string;
  forgetHtml?: string;
  /** Signup agreement (terms of use) content — markdown link syntax supported. */
  termsOfUse?: string;
  signinMethods: SigninMethod[];
  signupItems: SignupItem[];
  signinItems: SigninItem[];
  forgetItems?: SigninItem[];
  /**
   * Layout template id. Empty / missing → "centered-card" (default). Pages
   * resolve via `resolveTemplate()`; unknown ids also fall back to default.
   */
  template?: string;
  /** Template-specific options (hero image, sidebar copy, etc). Schema owned by each template. */
  templateOptions?: Record<string, unknown>;
  themeData?: ResolvedTheme | null;
  organizationObj?: {
    name: string;
    displayName: string;
    logo: string;
    logoDark: string;
    favicon: string;
    themeData?: ResolvedTheme | null;
    countryCodes?: string[];
    languages?: string[];
  } | null;
}

export interface AppLoginResponse {
  status: "ok" | "error";
  msg?: string;
  data: AuthApplication;
  providersResolved: ResolvedProvider[];
}

export interface SigninMethodInfo {
  name: string;        // "Password" | "Verification code" | "WebAuthn" | "Face ID" | "LDAP" | "WeChat"
  displayName: string;
  rule: string;
}

export interface ResolveSigninPayload {
  methods: SigninMethodInfo[];
  recommended: string; // method name, or "" when none
  userHint: string;    // e.g. "a***@example.com" or ""
}

export interface ResolveSigninResponse {
  status: "ok" | "error";
  msg?: string;
  data: ResolveSigninPayload;
}

export interface ResolveSigninRequest {
  application: string;
  organization?: string;
  identifier: string;
}
