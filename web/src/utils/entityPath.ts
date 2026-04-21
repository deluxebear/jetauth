// Build the admin-console edit-page URL for an owned entity. The router
// registers every entity under the pattern `/:entityTypePlural/:owner/:name`
// (see App.tsx entityRoutes) — skipping the owner segment silently falls
// through to the catch-all and redirects to home. Centralising the template
// removes 30+ repeated inline `/plural/${r.owner}/${encodeURIComponent(r.name)}`
// literals across the list pages and locks in the encoding.
export function entityEditPath(
  plural: string,
  record: { owner: string; name: string },
): string {
  return `/${plural}/${record.owner}/${encodeURIComponent(record.name)}`;
}
