import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import * as OrgBackend from "./backend/OrganizationBackend";
import { isGlobalAdmin as checkGlobalAdmin, getStoredAccount, type Account } from "./utils/auth";

interface OrgOption {
  name: string;
  displayName: string;
}

interface OrganizationContextType {
  /** Currently selected org name, or "All" */
  selectedOrg: string;
  setSelectedOrg: (org: string) => void;
  /** Organization list for dropdown */
  orgOptions: OrgOption[];
  /** The owner param to pass to list APIs: returns "" when "All", otherwise the org name */
  getRequestOwner: () => string;
  /** The owner to use when creating new entities: returns "built-in" when "All", otherwise the org name */
  getNewEntityOwner: () => string;
  /** Refresh the organization options dropdown */
  refreshOrgOptions: () => void;
  /** Whether "All" is selected */
  isAll: boolean;
  /** Whether the current user is a global admin (built-in org) */
  isGlobalAdmin: boolean;
}

const OrganizationContext = createContext<OrganizationContextType>(null!);

export function useOrganization() {
  return useContext(OrganizationContext);
}

const STORAGE_KEY = "organization";

/** Read account reactively — re-reads when localStorage "account" key changes */
function useAccount(): Account | null {
  const [account, setAccount] = useState<Account | null>(getStoredAccount);

  useEffect(() => {
    // Re-read account when storage changes (login/logout from another tab or same-tab update)
    const onStorage = (e: StorageEvent) => {
      if (e.key === "account" || e.key === null) {
        setAccount(getStoredAccount());
      }
    };
    // Custom event fired by App.tsx on login/logout
    const onAccountChange = () => setAccount(getStoredAccount());

    window.addEventListener("storage", onStorage);
    window.addEventListener("accountChanged", onAccountChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("accountChanged", onAccountChange);
    };
  }, []);

  return account;
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const isGA = checkGlobalAdmin(account);
  // Non-global admins are locked to their own org
  const userOrg = account?.owner ?? "built-in";

  const [selectedOrg, setSelectedOrgState] = useState<string>(() => {
    if (!isGA) return userOrg;
    return localStorage.getItem(STORAGE_KEY) ?? "All";
  });
  const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);

  const setSelectedOrg = useCallback((org: string) => {
    // Non-global admins cannot change org
    if (!isGA) return;
    setSelectedOrgState(org);
    localStorage.setItem(STORAGE_KEY, org);
    window.dispatchEvent(new Event("storageOrganizationChanged"));
  }, [isGA]);

  const refreshOrgOptions = useCallback(() => {
    OrgBackend.getOrganizationNames("admin").then((res) => {
      if (res.status === "ok" && Array.isArray(res.data)) {
        setOrgOptions(res.data as OrgOption[]);
      }
    });
  }, []);

  useEffect(() => {
    refreshOrgOptions();
    // Re-fetch when orgs are added/deleted elsewhere
    const handler = () => refreshOrgOptions();
    window.addEventListener("organizationsChanged", handler);
    return () => window.removeEventListener("organizationsChanged", handler);
  }, [refreshOrgOptions]);

  // Force non-global admins to their own org when account changes
  useEffect(() => {
    if (!isGA) {
      setSelectedOrgState(userOrg);
    }
  }, [isGA, userOrg]);

  const isAll = isGA && selectedOrg === "All";
  const getRequestOwner = useCallback(() => {
    if (!isGA) return userOrg;
    return isAll ? "" : selectedOrg;
  }, [isGA, userOrg, isAll, selectedOrg]);

  const getNewEntityOwner = useCallback(() => {
    if (!isGA) return userOrg;
    return isAll ? "built-in" : selectedOrg;
  }, [isGA, userOrg, isAll, selectedOrg]);

  return (
    <OrganizationContext.Provider value={{ selectedOrg, setSelectedOrg, orgOptions, refreshOrgOptions, getRequestOwner, getNewEntityOwner, isAll, isGlobalAdmin: isGA }}>
      {children}
    </OrganizationContext.Provider>
  );
}
