// Permission helpers that mirror the backend's authorization checks.

export interface Account {
  owner: string;
  name: string;
  isAdmin?: boolean;
  [key: string]: unknown;
}

/** Global admin: any user in the "built-in" organization */
export function isGlobalAdmin(account: Account | null | undefined): boolean {
  if (!account) return false;
  return account.owner === "built-in";
}

/** Local admin: org admin (isAdmin=true) OR global admin */
export function isLocalAdmin(account: Account | null | undefined): boolean {
  if (!account) return false;
  return account.isAdmin === true || isGlobalAdmin(account);
}

/**
 * Whether the account may approve/reject permissions owned by `owner`:
 * a global admin, or an admin of that same organization. Mirrors the
 * backend `isPermissionApprover` check (the backend is authoritative).
 */
export function canApprovePermission(account: Account | null | undefined, owner: string): boolean {
  if (!account) return false;
  if (isGlobalAdmin(account)) return true;
  return account.isAdmin === true && account.owner === owner;
}

/** Read the current user account from localStorage */
export function getStoredAccount(): Account | null {
  try {
    return JSON.parse(localStorage.getItem("account") ?? "null");
  } catch {
    return null;
  }
}
