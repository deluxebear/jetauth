// MFA (Multi-factor Authentication) API

const SERVER_URL = "";

function getAcceptLanguage(): string {
  return localStorage.getItem("locale") ?? navigator.language ?? "en";
}

function postForm(path: string, data: Record<string, string>): Promise<{ status: string; msg?: string; data?: unknown }> {
  const form = new FormData();
  for (const [k, v] of Object.entries(data)) {
    form.append(k, v);
  }
  return fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    credentials: "include",
    body: form,
    headers: { "Accept-Language": getAcceptLanguage() },
  }).then((res) => res.json());
}

export function setPreferredMfa(owner: string, name: string, mfaType: string) {
  return postForm("/api/set-preferred-mfa", { owner, name, mfaType });
}

export function deleteMfa(owner: string, name: string) {
  return postForm("/api/delete-mfa", { owner, name });
}

export function mfaSetupInitiate(owner: string, name: string, mfaType: string) {
  return postForm("/api/mfa/setup/initiate", { owner, name, mfaType });
}

// Matches original: MfaSetupEnable({mfaType, ...user})
// Backend expects: mfaType, owner, name, secret, recoveryCodes, dest, countryCode
export function mfaSetupEnable(
  mfaType: string,
  user: Record<string, unknown>
) {
  return postForm("/api/mfa/setup/enable", {
    mfaType,
    owner: String(user.owner ?? ""),
    name: String(user.name ?? ""),
    secret: String(user.secret ?? ""),
    recoveryCodes: String(user.recoveryCodes ?? ""),
    dest: String(mfaType === "email" ? (user.email ?? "") : (user.phone ?? "")),
    countryCode: String(user.countryCode ?? ""),
  });
}
