import CryptoJS from "crypto-js";

/**
 * Encrypt a password using the organization's obfuscation settings.
 * Returns the encrypted password (or plaintext if type is "Plain" or empty).
 */
export function encryptPassword(
  obfuscatorType: string | undefined,
  obfuscatorKey: string | undefined,
  password: string
): string {
  if (!obfuscatorType || obfuscatorType === "Plain" || !obfuscatorKey) {
    return password;
  }

  const passwordHex = CryptoJS.enc.Hex.parse(
    Buffer.from ? Buffer.from(password, "utf-8").toString("hex")
      : Array.from(new TextEncoder().encode(password)).map(b => b.toString(16).padStart(2, "0")).join("")
  );
  const key = CryptoJS.enc.Hex.parse(obfuscatorKey);

  if (obfuscatorType === "AES") {
    const iv = CryptoJS.lib.WordArray.random(16);
    const encrypted = CryptoJS.AES.encrypt(passwordHex, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return iv.concat(encrypted.ciphertext).toString(CryptoJS.enc.Hex);
  }

  if (obfuscatorType === "DES") {
    const iv = CryptoJS.lib.WordArray.random(8);
    const encrypted = CryptoJS.DES.encrypt(passwordHex, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return iv.concat(encrypted.ciphertext).toString(CryptoJS.enc.Hex);
  }

  return password;
}

/**
 * Get organization obfuscation config from localStorage.
 */
export function getObfuscatorConfig(): { type: string; key: string } {
  try {
    const org = JSON.parse(localStorage.getItem("organizationData") ?? "null");
    return {
      type: org?.passwordObfuscatorType ?? "Plain",
      key: org?.passwordObfuscatorKey ?? "",
    };
  } catch {
    return { type: "Plain", key: "" };
  }
}

/**
 * Convenience: encrypt password using stored org config.
 */
export function obfuscatePassword(password: string): string {
  const { type, key } = getObfuscatorConfig();
  return encryptPassword(type, key, password);
}
