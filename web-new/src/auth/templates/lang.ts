// web-new/src/auth/templates/lang.ts
//
// Shared helper for template option values that may be either a plain
// string (legacy) or a { zh, en } bilingual object. Templates call this
// when rendering so they never have to care which shape they're looking at.

export function pickLang(value: unknown, locale: string): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const fromLocale = obj[locale];
    if (typeof fromLocale === "string" && fromLocale.length > 0) return fromLocale;
    // Fall through to a sensible default when the admin only filled one
    // language — ZH first (most of this codebase's users), then EN.
    if (typeof obj.zh === "string" && obj.zh.length > 0) return obj.zh;
    if (typeof obj.en === "string" && obj.en.length > 0) return obj.en;
  }
  return "";
}
