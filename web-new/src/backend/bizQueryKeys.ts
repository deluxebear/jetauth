// Centralized TanStack Query keys for the biz-permission module.
//
// Why a module instead of inline arrays:
//   1. Invalidation and read MUST share the exact same tuple shape. A typo
//      ("biz" vs "Biz", swapping owner/appName) silently breaks cache
//      coherence — no type error, no runtime error, just stale UI.
//   2. Every key gets a single authoritative definition, so renaming a
//      slice is one-touch rather than find-and-replace across files.
//
// Convention: keys are returned as `as const` tuples so TS narrows them,
// and any extra elements after the stable prefix (e.g. pagination offset)
// are omitted from the "invalidation prefix" helpers — invalidateQueries
// with the prefix matches every page/variant under it.
export const bizKeys = {
  app: (owner: string | undefined, appName: string | undefined) =>
    ["biz", "app", owner, appName] as const,

  appMeta: (appName: string | undefined) =>
    ["biz", "app-meta", appName] as const,

  roles: (owner: string | undefined, appName: string | undefined) =>
    ["biz", "roles", owner, appName] as const,

  permissions: (owner: string | undefined, appName: string | undefined) =>
    ["biz", "permissions", owner, appName] as const,

  roleParents: (roleId: number | undefined) =>
    ["biz", "role-parents", roleId] as const,

  roleChildren: (roleId: number | undefined) =>
    ["biz", "role-children", roleId] as const,

  rolePermissions: (org: string | undefined, roleName: string | undefined) =>
    ["biz", "role-permissions", org, roleName] as const,

  roleStats: (roleId: number | undefined) =>
    ["biz", "role-stats", roleId] as const,

  permissionStats: (permissionId: number | undefined) =>
    ["biz", "permission-stats", permissionId] as const,

  appResources: (owner: string | undefined, appName: string | undefined) =>
    ["biz", "app-resources", owner, appName] as const,

  // The "prefix" form matches every paginated variant — use it to invalidate
  // all pages of a role's member list at once.
  roleMembers: (roleId: number) =>
    ["biz", "role-members", roleId] as const,
  roleMembersPage: (roleId: number, offset: number) =>
    ["biz", "role-members", roleId, offset] as const,

  permissionGrantees: (permissionId: number) =>
    ["biz", "permission-grantees", permissionId] as const,
  permissionGranteesPage: (permissionId: number, offset: number) =>
    ["biz", "permission-grantees", permissionId, offset] as const,

  testSubjects: (kind: "users" | "groups", owner: string, q: string) =>
    ["biz", "test-subjects", kind, owner, q] as const,
} as const;
