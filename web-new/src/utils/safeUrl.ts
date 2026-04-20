/**
 * Returns the URL if it uses a safe external scheme (http/https), otherwise "#".
 * Guard admin-controlled URL fields (homepageUrl, signinUrl, websiteUrl, etc.)
 * before rendering them as clickable links — prevents javascript:/data: URLs
 * from executing if an admin account is compromised.
 */
export function safeExternalUrl(url: string | null | undefined): string {
  if (!url) return "#";
  const s = String(url).trim();
  if (!s) return "#";
  if (/^https?:\/\//i.test(s)) return s;
  return "#";
}
