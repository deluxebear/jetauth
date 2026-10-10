import type { ModelSupport } from "./casbinModel";

export type PermissionFormErrorKey =
  | "permissions.validation.noSubject"
  | "permissions.validation.noResources"
  | "permissions.validation.noActions"
  | "permissions.validation.domainsUnsupported";

interface PermissionFields {
  users?: string[] | null;
  roles?: string[] | null;
  resources?: string[] | null;
  actions?: string[] | null;
  domains?: string[] | null;
}

/**
 * Mirrors the backend save-time validation. Groups are not a subject: they never
 * generate policies. `support` may be null while the model text is still loading,
 * in which case model-dependent rules are skipped (the server re-checks).
 */
export function validatePermissionForm(p: PermissionFields, support: ModelSupport | null): PermissionFormErrorKey | null {
  const rolesCount = !support || support.hasRole ? (p.roles?.length ?? 0) : 0;
  if ((p.users?.length ?? 0) + rolesCount === 0) return "permissions.validation.noSubject";
  if (!p.resources?.length) return "permissions.validation.noResources";
  if (!p.actions?.length) return "permissions.validation.noActions";
  if (support && !support.hasDomain && p.domains?.length) return "permissions.validation.domainsUnsupported";
  return null;
}
