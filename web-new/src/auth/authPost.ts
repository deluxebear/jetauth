export type LoginType = "code" | "login" | "saml";

export interface LoginApiResponse {
  status: string;
  msg?: string;
  data?: string;
  data2?: { redirectUrl?: string; method?: string };
}

export interface SamlSubmitArgs {
  samlResponse: string;
  redirectUrl: string;
  method?: "POST" | "GET" | string;
  relayState?: string;
}

export function buildOAuthRedirectUrl(redirectUri: string, code: string, state: string): string {
  const sep = redirectUri.includes("?") ? "&" : "?";
  return `${redirectUri}${sep}code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
}

export function readSamlParams(searchParams: URLSearchParams) {
  return {
    samlRequest: searchParams.get("samlRequest") ?? searchParams.get("SAMLRequest") ?? "",
    relayState: searchParams.get("relayState") ?? searchParams.get("RelayState") ?? "",
  };
}

/**
 * When SigninPage is mid OAuth-code flow (SP redirected user to our
 * /login/oauth/authorize), /api/login needs the OAuth params as URL query
 * — beego's Input.Query doesn't parse JSON bodies. Returns the camelCase
 * query string the backend expects, or empty when no client_id is present.
 */
export function buildOAuthCodeQuery(searchParams: URLSearchParams): string {
  const clientId = searchParams.get("client_id");
  if (!clientId) return "";
  const out = new URLSearchParams();
  out.set("clientId", clientId);
  out.set("responseType", searchParams.get("response_type") ?? "code");
  const redirectUri = searchParams.get("redirect_uri");
  if (redirectUri) out.set("redirectUri", redirectUri);
  const scope = searchParams.get("scope");
  if (scope) out.set("scope", scope);
  const state = searchParams.get("state");
  if (state) out.set("state", state);
  const nonce = searchParams.get("nonce");
  if (nonce) out.set("nonce", nonce);
  const codeChallenge = searchParams.get("code_challenge");
  if (codeChallenge) out.set("code_challenge", codeChallenge);
  const codeChallengeMethod = searchParams.get("code_challenge_method");
  if (codeChallengeMethod) out.set("code_challenge_method", codeChallengeMethod);
  return out.toString();
}

export function submitSamlResponse({
  samlResponse,
  redirectUrl,
  method,
  relayState,
}: SamlSubmitArgs): void {
  if (import.meta.env.DEV && typeof window !== "undefined" &&
      (window as unknown as { __JETAUTH_SAML_DEBUG?: boolean }).__JETAUTH_SAML_DEBUG) {
    const xml = (() => {
      try { return atob(samlResponse); } catch { return samlResponse; }
    })();
    console.log("[JETAUTH SAML DEBUG] redirectUrl =", redirectUrl);
    console.log("[JETAUTH SAML DEBUG] method =", method);
    console.log("[JETAUTH SAML DEBUG] relayState =", relayState);
    console.log("[JETAUTH SAML DEBUG] decoded XML:\n", xml);
    alert("SAML debug: open Console (F12) to see the decoded response. Auto-POST skipped.");
    return;
  }
  const form = document.createElement("form");
  form.method = String(method ?? "POST").toUpperCase() === "GET" ? "GET" : "POST";
  form.action = redirectUrl;
  form.style.display = "none";

  const appendField = (name: string, value: string) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  };

  appendField("SAMLResponse", samlResponse);
  if (relayState) {
    appendField("RelayState", relayState);
  }

  document.body.appendChild(form);
  form.submit();
}
