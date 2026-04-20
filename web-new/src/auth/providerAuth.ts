// Ported from legacy web/src/auth/Provider.js + Util.js.
//
// ResolvedProvider on the wire carries name / type / clientId only — no scopes,
// no domain, no customAuthUrl. So built-in types use the hardcoded scope below;
// types that need admin-set endpoint/domain (ADFS / Okta / AzureAD / Custom /
// Nextcloud / ...) aren't supported until ResolvedProvider is extended.

import type { AuthApplication, ResolvedProvider } from "./api/types";
import { api } from "../api/client";

// Client-side flows that never produce a provider-issued `code` the backend
// needs to exchange back through our PKCE verifier — Web3 wallets generate a
// signature locally, Telegram posts widget HMAC, Steam returns openid.* params.
// For these, stashing a PKCE verifier is dead weight (and would orphan
// sessionStorage entries since AuthCallback / login pages never consume them).
const clientOnlyTypes = new Set(["MetaMask", "Web3Onboard", "Telegram", "Steam"]);

/** Subset of EIP-1193 we touch — enough to type window.ethereum without pulling a wallet lib. */
export interface EIP1193Provider {
  request<T = unknown>(args: { method: string; params?: unknown[] }): Promise<T>;
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr);
}

function generateNonce(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(hash));
}

function storeCodeVerifier(state: string, verifier: string): void {
  sessionStorage.setItem(`pkce_verifier_${state}`, verifier);
}

/** Atomically read-and-delete the verifier for this state. */
export function consumeCodeVerifier(state: string): string | null {
  const key = `pkce_verifier_${state}`;
  const v = sessionStorage.getItem(key);
  if (v !== null) sessionStorage.removeItem(key);
  return v;
}

// State round-trips through the OAuth provider; backend's /api/login decodes
// it as "application=...&provider=...&method=...". Format must match the legacy
// Casdoor encoding so existing backend code stays untouched.
//
// A crypto-random nonce is injected so state is unpredictable to an attacker.
// Combined with AuthCallback's "reject if sessionStorage has no PKCE verifier
// for this state" check, this defeats login-CSRF: an attacker who forges a
// /callback URL can't guess the nonce, so the state won't match any verifier
// the victim actually stashed. RFC 6749 §10.12.

export function encodeState(
  applicationName: string,
  providerName: string,
  method: string,
  organizationName: string = "",
): string {
  const nonce = generateNonce();
  const query = `${window.location.search}&application=${encodeURIComponent(applicationName)}&organization=${encodeURIComponent(organizationName)}&provider=${encodeURIComponent(providerName)}&method=${encodeURIComponent(method)}&nonce=${nonce}`;
  return btoa(query);
}

export function decodeState(state: string): URLSearchParams {
  try {
    return new URLSearchParams(atob(state));
  } catch {
    return new URLSearchParams();
  }
}

interface ProviderAuthInfo {
  endpoint: string;
  scope: string;
}

const authInfo: Record<string, ProviderAuthInfo> = {
  GitHub:       { endpoint: "https://github.com/login/oauth/authorize",          scope: "user:email+read:user" },
  Google:       { endpoint: "https://accounts.google.com/signin/oauth",           scope: "profile+email" },
  Gitee:        { endpoint: "https://gitee.com/oauth/authorize",                  scope: "user_info%20emails" },
  GitLab:       { endpoint: "https://gitlab.com/oauth/authorize",                 scope: "read_user+profile" },
  Gitea:        { endpoint: "https://gitea.com/login/oauth/authorize",            scope: "user:email" },
  Facebook:     { endpoint: "https://www.facebook.com/dialog/oauth",              scope: "email,public_profile" },
  LinkedIn:     { endpoint: "https://www.linkedin.com/oauth/v2/authorization",    scope: "r_liteprofile%20r_emailaddress" },
  Discord:      { endpoint: "https://discord.com/api/oauth2/authorize",           scope: "identify%20email" },
  Slack:        { endpoint: "https://slack.com/oauth/v2/authorize",               scope: "users:read,users:read.email" },
  Bitbucket:    { endpoint: "https://bitbucket.org/site/oauth2/authorize",        scope: "account%20email" },
  Dropbox:      { endpoint: "https://www.dropbox.com/oauth2/authorize",           scope: "account_info.read" },
  Twitter:      { endpoint: "https://twitter.com/i/oauth2/authorize",             scope: "users.read%20tweet.read" },
  Weibo:        { endpoint: "https://api.weibo.com/oauth2/authorize",             scope: "email" },
  QQ:           { endpoint: "https://graph.qq.com/oauth2.0/authorize",            scope: "get_user_info" },
  DingTalk:     { endpoint: "https://login.dingtalk.com/oauth2/auth",             scope: "openid" },
  Baidu:        { endpoint: "https://openapi.baidu.com/oauth/2.0/authorize",      scope: "basic" },
  // Lark's actual endpoint + param shape is handled by the per-type branch in
  // getAuthUrl (switches Feishu China vs Lark Suite via DisableSsl). Entry here
  // is only present to satisfy the "known type" check.
  Lark:         { endpoint: "https://open.feishu.cn/open-apis/authen/v1/index",   scope: "" },
  // WeChat / WeCom / Apple / Steam: endpoint here is placeholder only — each
  // type's branch in getAuthUrl picks the right endpoint from its subType /
  // method / UA context. Entries exist so the "known type" guard passes.
  WeChat:       { endpoint: "https://open.weixin.qq.com/connect/qrconnect",       scope: "snsapi_login" },
  WeCom:        { endpoint: "https://login.work.weixin.qq.com/wwlogin/sso/login", scope: "snsapi_userinfo" },
  Apple:        { endpoint: "https://appleid.apple.com/auth/authorize",           scope: "name email" },
  Steam:        { endpoint: "https://steamcommunity.com/openid/login",            scope: "" },
  // MetaMask / Web3Onboard / Telegram: the "endpoint" is a local SPA route
  // that handles the wallet signature / Telegram widget entirely in-browser,
  // then POSTs to /api/login. See WalletLoginPage.tsx / TelegramLoginPage.tsx.
  MetaMask:     { endpoint: "/auth/wallet/metamask",                               scope: "" },
  Web3Onboard:  { endpoint: "/auth/wallet/web3onboard",                            scope: "" },
  Telegram:     { endpoint: "/auth/telegram-login",                                scope: "" },
};

// Types whose authorize URL is admin-configured (per-tenant / per-install)
// rather than hardcoded. Separate set from `authInfo` above.
const dynamicEndpointTypes = new Set([
  "Auth0", "Okta", "ADFS", "Casdoor", "Custom",
  "AzureAD", "AzureADB2C", "Nextcloud",
]);

function resolveDynamicEndpoint(provider: ResolvedProvider): { endpoint: string; scope: string } | null {
  const defaultScope = "openid+profile+email";
  switch (provider.type) {
    case "Auth0":
      if (!provider.domain) return null;
      return { endpoint: `https://${provider.domain}/authorize`, scope: provider.scopes || defaultScope };
    case "Okta":
      if (!provider.domain) return null;
      return { endpoint: `${provider.domain}/v1/authorize`, scope: provider.scopes || defaultScope };
    case "ADFS":
      if (!provider.domain) return null;
      return { endpoint: `${provider.domain}/adfs/oauth2/authorize`, scope: provider.scopes || "openid" };
    case "Casdoor":
      if (!provider.domain) return null;
      return { endpoint: `${provider.domain}/login/oauth/authorize`, scope: provider.scopes || defaultScope };
    case "Custom":
      if (!provider.customAuthUrl) return null;
      return { endpoint: provider.customAuthUrl, scope: provider.scopes || defaultScope };
    case "AzureAD":
      // Tenant can be "common" (any Microsoft account) or a specific tenant GUID / domain.
      return {
        endpoint: `https://login.microsoftonline.com/${provider.domain || "common"}/oauth2/v2.0/authorize`,
        scope: provider.scopes || defaultScope,
      };
    case "Nextcloud":
      if (!provider.domain) return null;
      return { endpoint: `${provider.domain.replace(/\/$/, "")}/apps/oauth2/authorize`, scope: provider.scopes || defaultScope };
    default:
      return null;
  }
}

export async function getAuthUrl(
  application: AuthApplication,
  provider: ResolvedProvider,
  method: "signin" | "signup" | "link" = "signin"
): Promise<string> {
  const info = resolveDynamicEndpoint(provider) ?? authInfo[provider.type];
  if (!info) {
    const reason = dynamicEndpointTypes.has(provider.type)
      ? `missing ${provider.type === "Custom" ? "customAuthUrl" : "domain"} — set it on the provider in the admin console`
      : `no URL template for this type`;
    console.error(`[providerAuth] Cannot build auth URL for provider "${provider.name}" (type=${provider.type}): ${reason}`);
    return "";
  }

  const redirectUri = `${window.location.origin}/callback`;
  const orgName = application.organizationObj?.name ?? application.organization ?? "";
  const state = encodeState(application.name, provider.name, method, orgName);
  // PKCE verifier only matters for types that round-trip through AuthCallback
  // to exchange a server-issued code. Client-only flows (Web3 / Telegram /
  // Steam OpenID) skip both the stash and the later consume.
  const needsPkce = !clientOnlyTypes.has(provider.type);
  const verifier = needsPkce ? generateCodeVerifier() : "";
  if (needsPkce) storeCodeVerifier(state, verifier);

  if (provider.type === "Twitter") {
    const challenge = await generateCodeChallenge(verifier);
    return `${info.endpoint}?client_id=${provider.clientId}&redirect_uri=${redirectUri}&state=${state}&response_type=code&scope=${info.scope}&code_challenge=${challenge}&code_challenge_method=S256`;
  }

  if (provider.type === "QQ") {
    return `${info.endpoint}?response_type=code&client_id=${provider.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(info.scope)}`;
  }

  if (provider.type === "DingTalk") {
    return `${info.endpoint}?client_id=${provider.clientId}&redirect_uri=${redirectUri}&scope=${info.scope}&response_type=code&prompt=login%20consent&state=${state}`;
  }

  if (provider.type === "AzureADB2C") {
    // B2C URL shape: https://<tenant>.b2clogin.com/<tenant>.onmicrosoft.com/<userFlow>/oauth2/v2.0/authorize
    // `domain` is the tenant name (e.g. "contoso"), `appId` is the user-flow name (e.g. "B2C_1_signin").
    if (!provider.domain || !provider.appId) {
      console.error(`[providerAuth] AzureADB2C needs both domain (tenant name) and appId (user flow) set`);
      return "";
    }
    return `https://${provider.domain}.b2clogin.com/${provider.domain}.onmicrosoft.com/${provider.appId}/oauth2/v2.0/authorize?client_id=${provider.clientId}&nonce=defaultNonce&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${info.scope}&response_type=code&state=${state}&prompt=login`;
  }

  if (provider.type === "Lark") {
    // Feishu China (default) vs Lark Suite international (disableSsl=true).
    // Lark expects `app_id` not `client_id`.
    const endpoint = provider.disableSsl
      ? "https://accounts.larksuite.com/open-apis/authen/v1/authorize"
      : "https://open.feishu.cn/open-apis/authen/v1/index";
    const uri = provider.disableSsl ? encodeURIComponent(redirectUri) : redirectUri;
    return `${endpoint}?app_id=${provider.clientId}&redirect_uri=${uri}&state=${state}`;
  }

  if (provider.type === "WeChat") {
    // Two entry points:
    //  - Inside WeChat mobile app browser (UA contains "MicroMessenger"): hit
    //    the MP (公众号) oauth endpoint using clientId2 as the appid. Falls
    //    back to the desktop endpoint + clientId if no MP account configured.
    //  - Regular desktop / mobile-web browser: QR-scan login via open.weixin.
    // Both append the #wechat_redirect hash that WeChat's OAuth requires.
    const inWeChatApp = typeof navigator !== "undefined" && navigator.userAgent.includes("MicroMessenger");
    if (inWeChatApp && provider.clientId2) {
      const mpEndpoint = "https://open.weixin.qq.com/connect/oauth2/authorize";
      return `${mpEndpoint}?appid=${provider.clientId2}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=snsapi_userinfo&response_type=code#wechat_redirect`;
    }
    const endpoint = "https://open.weixin.qq.com/connect/qrconnect";
    return `${endpoint}?appid=${provider.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=snsapi_login&response_type=code&state=${state}#wechat_redirect`;
  }

  if (provider.type === "WeCom") {
    // 4-way matrix: (Internal | Third-party) × (Silent | Normal). Silent uses
    // the public WeChat open-platform endpoint and returns a code we exchange
    // server-side; Normal uses login.work.weixin.qq.com and differs in the
    // login_type param. Internal/Normal additionally carries the Agent ID.
    const silent = provider.method === "Silent";
    const thirdParty = provider.subType === "Third-party";

    if (silent) {
      const endpoint = "https://open.weixin.qq.com/connect/oauth2/authorize";
      return `${endpoint}?appid=${provider.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=snsapi_userinfo&response_type=code#wechat_redirect`;
    }
    const endpoint = "https://login.work.weixin.qq.com/wwlogin/sso/login";
    if (thirdParty) {
      return `${endpoint}?login_type=ServiceApp&appid=${provider.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    }
    // Internal + Normal needs the Agent ID.
    if (!provider.appId) {
      console.error(`[providerAuth] WeCom Internal/Normal requires Agent ID (AppId) to be set`);
      return "";
    }
    return `${endpoint}?login_type=CorpApp&appid=${provider.clientId}&agentid=${provider.appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  }

  if (provider.type === "Apple") {
    // Apple uses response_mode=form_post → Apple POSTs code+id_token to our
    // /api/callback (not the SPA /callback). Backend redirects POSTed code
    // through to /callback so AuthCallback picks it up. redirect_uri in the
    // authorize URL must match what's registered in the Apple Developer
    // console — that's configured as /api/callback on our side.
    const appleRedirectUri = `${window.location.origin}/api/callback`;
    return `${info.endpoint}?client_id=${provider.clientId}&redirect_uri=${encodeURIComponent(appleRedirectUri)}&state=${state}&response_type=code%20id_token&scope=${info.scope}&response_mode=form_post`;
  }

  if (provider.type === "Steam") {
    // Steam uses OpenID 2.0 (not OAuth2). No code, no client secret — return
    // comes with openid.* query params Steam signed. AuthCallback detects
    // `openid.mode` and forwards the whole query string as "code" to the
    // backend Steam IdP. state is packed into return_to as a query param
    // because OpenID doesn't carry a separate state field.
    const origin = window.location.origin;
    const returnTo = `${redirectUri}?state=${state}`;
    return (
      `${info.endpoint}?openid.claimed_id=${encodeURIComponent("http://specs.openid.net/auth/2.0/identifier_select")}` +
      `&openid.identity=${encodeURIComponent("http://specs.openid.net/auth/2.0/identifier_select")}` +
      `&openid.mode=checkid_setup` +
      `&openid.ns=${encodeURIComponent("http://specs.openid.net/auth/2.0")}` +
      `&openid.realm=${encodeURIComponent(origin)}` +
      `&openid.return_to=${encodeURIComponent(returnTo)}`
    );
  }

  // Web3 + Telegram: these three don't have authorize URLs on an external
  // provider — the flow is entirely client-side. Redirect to a local SPA
  // page that handles the wallet signature / Telegram widget and POSTs the
  // resulting code to /api/login itself. state carries application + provider
  // + method the same way it does for OAuth providers.
  if (provider.type === "MetaMask") {
    return `${window.location.origin}/auth/wallet/metamask?state=${state}`;
  }
  if (provider.type === "Web3Onboard") {
    return `${window.location.origin}/auth/wallet/web3onboard?state=${state}`;
  }
  if (provider.type === "Telegram") {
    // ClientId carries the Telegram bot's @username (ClientSecret is the bot
    // token; the widget only needs the username).
    if (!provider.clientId) {
      console.error(`[providerAuth] Telegram provider needs the bot @username in Client ID`);
      return "";
    }
    return `${window.location.origin}/auth/telegram-login?state=${state}&bot=${encodeURIComponent(provider.clientId)}`;
  }

  return `${info.endpoint}?client_id=${provider.clientId}&redirect_uri=${redirectUri}&scope=${info.scope}&response_type=code&state=${state}`;
}

/**
 * Shared POST to /api/login for every provider-return path — AuthCallback
 * (OAuth code), WalletLoginPage (Web3 signature), TelegramLoginPage (widget
 * HMAC). Centralising it keeps the body shape in sync; a past drift where
 * one call site hardcoded `codeVerifier: ""` silently bypassed PKCE on any
 * provider routed through it.
 */
export async function submitProviderLogin(args: {
  applicationName: string;
  providerName: string;
  code: string;
  method: string;
  codeVerifier?: string;
  /**
   * Forwarded to AuthForm.InvitationCode on the backend. Required when the
   * app has `Invitation code` as a required signupItem — without it, the
   * first-time OAuth/Web3 signup fails CheckInvitationCode with "cannot be
   * blank" and there's no UI to recover. Originating login URL carries it
   * as `?invitationCode=...`; encodeState bakes window.location.search into
   * state, so the callback can read it back via decodeState.
   */
  invitationCode?: string;
}): Promise<{ status: string; msg?: string; data?: unknown }> {
  return api.post<{ status: string; msg?: string; data?: unknown }>("/api/login", {
    type: "login",
    application: args.applicationName,
    organization: "",
    provider: args.providerName,
    code: args.code,
    state: args.applicationName,
    redirectUri: `${window.location.origin}/callback`,
    method: args.method,
    codeVerifier: args.codeVerifier ?? "",
    invitationCode: args.invitationCode ?? "",
  });
}
