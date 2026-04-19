// Ported from legacy web/src/auth/Provider.js + Util.js.
//
// ResolvedProvider on the wire carries name / type / clientId only — no scopes,
// no domain, no customAuthUrl. So built-in types use the hardcoded scope below;
// types that need admin-set endpoint/domain (ADFS / Okta / AzureAD / Custom /
// Nextcloud / ...) aren't supported until ResolvedProvider is extended.

import type { AuthApplication, ResolvedProvider } from "./api/types";

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

export function encodeState(applicationName: string, providerName: string, method: string): string {
  const nonce = generateNonce();
  const query = `${window.location.search}&application=${encodeURIComponent(applicationName)}&provider=${encodeURIComponent(providerName)}&method=${encodeURIComponent(method)}&nonce=${nonce}`;
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
};

export async function getAuthUrl(
  application: AuthApplication,
  provider: ResolvedProvider,
  method: "signin" | "signup" | "link" = "signin"
): Promise<string> {
  const info = authInfo[provider.type];
  if (!info) {
    console.error(`[providerAuth] No auth URL template for provider type "${provider.type}"`);
    return "";
  }

  const redirectUri = `${window.location.origin}/callback`;
  const state = encodeState(application.name, provider.name, method);
  const verifier = generateCodeVerifier();
  storeCodeVerifier(state, verifier);

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

  return `${info.endpoint}?client_id=${provider.clientId}&redirect_uri=${redirectUri}&scope=${info.scope}&response_type=code&state=${state}`;
}
