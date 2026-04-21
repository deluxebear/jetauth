// WebAuthn credential registration API

const SERVER_URL = "";

function getAcceptLanguage(): string {
  return localStorage.getItem("locale") ?? navigator.language ?? "en";
}

// Base64URL → ArrayBuffer
function bufferDecode(value: string): ArrayBuffer {
  value = value.replace(/-/g, "+").replace(/_/g, "/");
  while (value.length % 4) {
    value += "=";
  }
  const raw = atob(value);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    buf[i] = raw.charCodeAt(i);
  }
  return buf.buffer;
}

// ArrayBuffer → Base64URL
function bufferEncode(value: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Full WebAuthn registration ceremony:
 * 1. GET /api/webauthn/signup/begin → credential creation options
 * 2. navigator.credentials.create() → browser authenticator UI
 * 3. POST /api/webauthn/signup/finish → server verifies and saves
 */
export async function registerWebauthnCredential(): Promise<{ status: string; msg?: string }> {
  // Stage 1: Begin — get credential creation options from server
  const beginRes = await fetch(`${SERVER_URL}/api/webauthn/signup/begin`, {
    method: "GET",
    credentials: "include",
    headers: { "Accept-Language": getAcceptLanguage() },
  });
  if (!beginRes.ok) throw new Error(`${beginRes.status} ${beginRes.statusText}`);
  const credentialCreationOptions = await beginRes.json();

  // Decode base64url fields to ArrayBuffer for browser API
  credentialCreationOptions.publicKey.challenge = bufferDecode(
    credentialCreationOptions.publicKey.challenge
  );
  credentialCreationOptions.publicKey.user.id = bufferDecode(
    credentialCreationOptions.publicKey.user.id
  );
  if (credentialCreationOptions.publicKey.excludeCredentials) {
    for (const cred of credentialCreationOptions.publicKey.excludeCredentials) {
      cred.id = bufferDecode(cred.id);
    }
  }

  // Stage 2: Browser WebAuthn API — shows authenticator UI
  const credential = (await navigator.credentials.create({
    publicKey: credentialCreationOptions.publicKey,
  })) as PublicKeyCredential | null;

  if (!credential) {
    return { status: "error", msg: "WebAuthn registration was cancelled" };
  }

  const response = credential.response as AuthenticatorAttestationResponse;

  // Stage 3: Finish — send attestation to server
  const finishRes = await fetch(`${SERVER_URL}/api/webauthn/signup/finish`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": getAcceptLanguage(),
    },
    body: JSON.stringify({
      id: credential.id,
      rawId: bufferEncode(credential.rawId),
      type: credential.type,
      response: {
        attestationObject: bufferEncode(response.attestationObject),
        clientDataJSON: bufferEncode(response.clientDataJSON),
      },
    }),
  });

  if (!finishRes.ok) throw new Error(`${finishRes.status} ${finishRes.statusText}`);
  return finishRes.json();
}

/**
 * Delete a WebAuthn credential by its base64-encoded ID.
 * Matches original: POST /api/webauthn/delete-credential with FormData
 */
export async function deleteUserWebAuthnCredential(
  credentialID: string
): Promise<{ status: string; msg?: string }> {
  const form = new FormData();
  form.append("credentialID", credentialID);
  const res = await fetch(`${SERVER_URL}/api/webauthn/delete-credential`, {
    method: "POST",
    credentials: "include",
    body: form,
    headers: { "Accept-Language": getAcceptLanguage() },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
