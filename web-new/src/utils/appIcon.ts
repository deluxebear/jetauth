// Shared helper for picking the visible icon of an Application.
// Used by both the biz authz list page and the detail page so the icon the
// admin sees stays consistent across the whole flow.
//
// Why not filter the built-in default icons: even the stock /img/favicon.png
// is a legitimate bitmap that reads better than a colored letter avatar —
// admins expect "my app's icon" to win, and the letter fallback should only
// kick in when there's literally nothing to show (empty string) OR when
// loading the picked URL fails at runtime (handle that via the <img onError>
// callback, not here).
export function pickAppIcon(app: { favicon?: string; logo?: string }): string {
  const isMeaningful = (v?: string) => !!v && v.trim() !== "";
  if (isMeaningful(app.favicon)) return app.favicon!;
  if (isMeaningful(app.logo)) return app.logo!;
  return "";
}
