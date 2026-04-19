// web-new/src/pages/admin-preview/remoteRegistry.ts
//
// Loads and validates template manifests from third-party registry URLs.
// Pairs with the in-repo AUTH_TEMPLATES (curated tier) — the gallery
// merges both lists when it opens.
//
// Scope intentionally small:
//   - No signatures yet (v1.2 in docs/2026-04-19-template-store-proposal.md).
//     Remote manifests are marked "untrusted" in the UI so admins know.
//   - Hand-rolled validator — no new dependency.
//   - 5-minute sessionStorage cache so repeated gallery opens don't hit
//     the network every time; admins can clear via the settings panel.

import type { AuthTemplate } from "./templates";

const REGISTRY_URLS_KEY = "jetauth.template-registry.urls";
const CACHE_PREFIX = "jetauth.template-registry.cache:";
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface RegistryLoadResult {
  /** URL that produced these manifests. */
  url: string;
  /** Host shown as the third-party badge (e.g. "templates.example.com"). */
  host: string;
  manifests: AuthTemplate[];
  /** Non-null when the load failed entirely or the payload was invalid. */
  error: string | null;
}

// ── URL persistence ──────────────────────────────────────────────────────

export function getRegistryUrls(): string[] {
  try {
    const raw = localStorage.getItem(REGISTRY_URLS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

export function setRegistryUrls(urls: string[]) {
  try {
    localStorage.setItem(REGISTRY_URLS_KEY, JSON.stringify(urls));
  } catch {
    // Quota or privacy-mode — silently drop; admin can re-add next session.
  }
}

export function addRegistryUrl(url: string) {
  const urls = getRegistryUrls();
  if (urls.includes(url)) return;
  setRegistryUrls([...urls, url]);
}

export function removeRegistryUrl(url: string) {
  setRegistryUrls(getRegistryUrls().filter((u) => u !== url));
  try {
    sessionStorage.removeItem(CACHE_PREFIX + url);
  } catch {
    // ignore
  }
}

// ── Fetch + cache ────────────────────────────────────────────────────────

async function fetchRaw(url: string): Promise<unknown> {
  const cached = readCache(url);
  if (cached !== null) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, { signal: controller.signal, credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    writeCache(url, data);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function readCache(url: string): unknown {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + url);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw) as { at: number; data: unknown };
    if (Date.now() - at > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(url: string, data: unknown) {
  try {
    sessionStorage.setItem(
      CACHE_PREFIX + url,
      JSON.stringify({ at: Date.now(), data }),
    );
  } catch {
    // Quota — cache becomes best-effort.
  }
}

export function clearAllCaches() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // ignore
  }
}

// ── Validation ───────────────────────────────────────────────────────────

/**
 * Accepts either a bare AuthTemplate[] or { manifests: AuthTemplate[] }
 * — real registries tend to wrap payloads. Fields we don't understand
 * are discarded, not errors, so v2 registries serving extra metadata
 * still load in a v1 client.
 */
export function validateRegistryPayload(data: unknown): AuthTemplate[] {
  let list: unknown;
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === "object" && "manifests" in data) {
    list = (data as Record<string, unknown>).manifests;
  } else {
    throw new Error("registry payload must be an array or { manifests: [] }");
  }
  if (!Array.isArray(list)) {
    throw new Error("manifests field must be an array");
  }

  const out: AuthTemplate[] = [];
  for (const raw of list as unknown[]) {
    const m = validateOne(raw);
    if (m) out.push(m);
  }
  if (out.length === 0) {
    throw new Error("no valid manifests in payload");
  }
  return out;
}

function validateOne(raw: unknown): AuthTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === "string" && /^[a-z0-9-]+$/.test(r.id) ? r.id : null;
  const version = typeof r.version === "string" ? r.version : null;
  const name = typeof r.name === "string" ? r.name : null;
  const description = typeof r.description === "string" ? r.description : "";
  const preview = typeof r.preview === "string" ? r.preview : "";
  const config = r.config && typeof r.config === "object" ? (r.config as Record<string, unknown>) : null;

  if (!id || !version || !name || !config) return null;

  // Reject any script-ish field values — DOMPurify runs at render time but
  // we want validation to fail closed here too. A registry that tries to
  // ship "<script>" in signinHtml never reaches the sanitizer.
  for (const key of ["signinHtml", "signupHtml", "headerHtml", "footerHtml", "formSideHtml"]) {
    const v = config[key];
    if (typeof v === "string" && /<script\b|javascript:/i.test(v)) return null;
  }

  return {
    id,
    version,
    name,
    description,
    preview,
    config: sanitizeConfig(config),
  };
}

function sanitizeConfig(config: Record<string, unknown>): AuthTemplate["config"] {
  const out: AuthTemplate["config"] = {};
  if (typeof config.template === "string") out.template = config.template;
  if (config.templateOptions && typeof config.templateOptions === "object") {
    out.templateOptions = config.templateOptions as Record<string, unknown>;
  }
  const stringKeys = [
    "formBackgroundUrl",
    "formBackgroundUrlMobile",
    "formSideHtml",
    "formCss",
    "formCssMobile",
    "headerHtml",
    "footerHtml",
    "signinHtml",
    "signupHtml",
  ] as const;
  for (const k of stringKeys) {
    const v = config[k];
    if (typeof v === "string") out[k] = v;
  }
  if (typeof config.formOffset === "number") out.formOffset = config.formOffset;
  if (config.themeData && typeof config.themeData === "object") {
    out.themeData = config.themeData as AuthTemplate["config"]["themeData"];
  }
  return out;
}

// ── Public: load everything admins have registered ───────────────────────

export async function loadAllRegistries(): Promise<RegistryLoadResult[]> {
  const urls = getRegistryUrls();
  if (urls.length === 0) return [];
  return Promise.all(urls.map(loadOne));
}

async function loadOne(url: string): Promise<RegistryLoadResult> {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // Malformed URL — surface as an error result rather than throwing.
    return { url, host: url, manifests: [], error: "malformed URL" };
  }
  try {
    const raw = await fetchRaw(url);
    const manifests = validateRegistryPayload(raw);
    return { url, host, manifests, error: null };
  } catch (e) {
    return {
      url,
      host,
      manifests: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
