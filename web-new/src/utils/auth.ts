// Permission helpers matching original Casdoor backend logic

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

/** Read the current user account from localStorage */
export function getStoredAccount(): Account | null {
  try {
    return JSON.parse(localStorage.getItem("account") ?? "null");
  } catch {
    return null;
  }
}
